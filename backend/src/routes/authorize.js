// backend/src/routes/authorize.js
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { claimRequest, completeRequest, releaseRequest } from '../core/idempotency.js';
import { verifyDeterministicBounds } from '../core/deterministicVerifier.js';
import { getStateSnapshot, attemptAtomicSpend, reservePendingSpend } from '../core/stateMachine.js';
import { runInvestigatorAgent } from '../agent/investigatorAgent.js';
import { recheckAgentRecommendation } from '../agent/guardRechecker.js';
import { recordAuditEntry } from '../core/auditChain.js';
import { createRazorpayOrder, executeDomesticCardPayment, fetchRazorpayOrder } from '../payments/razorpayClient.js';
import { logDecision } from '../core/auditLog.js';

const router = express.Router();

/**
 * Central Pre-Authorization Gateway Endpoint
 * Dual-Mode: Supports standard JSON or Real-Time Server-Sent Events (SSE) streaming.
 * POST /api/v1/authorize
 */
router.post('/', async (req, res) => {
  const sessionId = req.body.session_id || `sess_${uuidv4().substring(0, 8)}`;
  const requestId = req.headers['x-request-id'] || req.body.request_id || sessionId;
  const { mandate, transaction } = req.body;

  // Detect SSE streaming request
  const isStreaming = req.headers.accept === 'text/event-stream' || req.query.stream === 'true';

  let sseEmitter = null;
  if (isStreaming) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    if (res.flushHeaders) res.flushHeaders();

    sseEmitter = ({ type, data }) => {
      res.write(`data: ${JSON.stringify({ type, data, timestamp: new Date().toISOString() })}\n\n`);
    };
  }

  if (!mandate || !transaction) {
    const errPayload = {
      error: 'MISSING_PAYLOAD',
      message: 'Both `mandate` and `transaction` objects are required.'
    };
    if (isStreaming) {
      sseEmitter({ type: 'error', data: errPayload });
      return res.end();
    }
    return res.status(400).json(errPayload);
  }

  const mandateId = mandate.mandate_id;

  // 1. Upstream 3-State Idempotency Check (M1 fix)
  const claim = await claimRequest(mandateId, requestId);
  if (!claim.claimed) {
    if (claim.existing.status === 'IN_FLIGHT') {
      const payload = {
        error: 'REQUEST_IN_FLIGHT',
        message: 'This request is currently being processed by Mandate Mirror. Duplicate submission rejected.',
        status: 'IN_FLIGHT'
      };
      if (isStreaming) {
        sseEmitter({ type: 'error', data: payload });
        return res.end();
      }
      return res.status(409).json(payload);
    }

    if (claim.existing.status === 'COMPLETED') {
      const payload = {
        ...claim.existing.result,
        idempotency_hit: true
      };
      if (isStreaming) {
        sseEmitter({ type: 'final', data: payload });
        return res.end();
      }
      return res.json(payload);
    }
  }

  try {
    // 2. Gate 1: Deterministic Bounds & Signature Verification (M2)
    const gate1Result = verifyDeterministicBounds({
      mandate,
      transaction,
      session_id: sessionId
    });

    if (!gate1Result.passed) {
      const auditEntry = await recordAuditEntry({
        session_id: sessionId,
        claimed_mandate: mandate,
        transaction,
        layer1_verifier: { result: 'fail', rule_cited: gate1Result.rule_cited, reason: gate1Result.reason },
        agent_recommendation: null,
        final_decision: 'HARD-BLOCK',
        override_applied: false,
        reasoning: `Deterministic Gate 1 Hard-Block: [${gate1Result.rule_cited}] ${gate1Result.reason}`
      });

      const responsePayload = {
        session_id: sessionId,
        decision: 'HARD-BLOCK',
        rule_cited: gate1Result.rule_cited,
        reason: gate1Result.reason,
        audit_entry_hash: auditEntry.entry_hash
      };

      await completeRequest(mandateId, requestId, responsePayload);

      if (isStreaming) {
        sseEmitter({ type: 'gate1_block', data: responsePayload });
        sseEmitter({ type: 'final', data: responsePayload });
        return res.end();
      }
      return res.status(403).json(responsePayload);
    }

    const amountPaise = gate1Result.amount_paise;
    transaction.amount_paise = amountPaise;

    // 3. Load Current Bucket State Snapshot
    const stateSnapshot = getStateSnapshot(mandateId);

    // 4. Gate 2: Non-Binding Investigator AI Agent Reasoning (M3c streaming)
    const agentOutput = await runInvestigatorAgent({
      mandate,
      transaction,
      stateSnapshot,
      sseEmitter
    });

    // 5. Gate 3: Deterministic Guard Re-check (Fix 4: delegates directly to verifyDeterministicBounds)
    const safetyCheck = recheckAgentRecommendation({
      mandate,
      transaction,
      stateSnapshot,
      agentRecommendation: agentOutput,
      session_id: sessionId,
      sseEmitter
    });

    let finalDecision = safetyCheck.final_decision;
    let razorpayOrder = null;
    let stateUpdateResult = null;

    // 6. Action Execution
    if (finalDecision === 'CLEAR') {
      // Attempt Atomic Spend against Calendar Bucket
      stateUpdateResult = await attemptAtomicSpend({
        mandate_id: mandateId,
        amount_paise: amountPaise,
        category: transaction.category,
        merchant: transaction.merchant,
        nonce: transaction.nonce || `txn_${sessionId}`,
        session_id: sessionId
      });

      if (!stateUpdateResult.success) {
        // Concurrency cap or race hit during write
        finalDecision = 'HARD-BLOCK';
        if (isStreaming) {
          sseEmitter({
            type: 'override',
            data: {
              original: 'CLEAR',
              overridden_to: 'HARD-BLOCK',
              reason: `Atomic State Machine Spend Rejection: ${stateUpdateResult.details}`
            }
          });
        }
      } else {
        // Spend committed -> Trigger Razorpay Test Order creation and Payment Capture
        try {
          razorpayOrder = await createRazorpayOrder({
            amount_paise: amountPaise,
            currency: mandate.currency || 'INR',
            receipt: `mandate_rcpt_${sessionId}`,
            mandate_id: mandateId,
            session_id: sessionId,
            notes: {
              mandate_id: mandateId,
              agent_id: mandate.agent_id,
              session_id: sessionId
            }
          });

          // Execute authentic domestic test card payment, submit 3DS OTP, and capture
          try {
            const paymentResult = await executeDomesticCardPayment({
              order_id: razorpayOrder.order_id,
              amount_paise: amountPaise,
              currency: mandate.currency || 'INR'
            });

            razorpayOrder = {
              ...razorpayOrder,
              payment_id: paymentResult.payment_id,
              payment_status: paymentResult.payment_status,
              payment_captured: paymentResult.payment_captured,
              order_status: paymentResult.order_status,
              amount_paid: paymentResult.amount_paid,
              amount_due: paymentResult.amount_due,
              razorpay_payment: paymentResult.payment_raw,
              razorpay_raw: paymentResult.order_raw || razorpayOrder.razorpay_raw
            };

            logDecision({
              event: 'RAZORPAY_PAYMENT_CAPTURED',
              mandate_id: mandateId,
              session_id: sessionId,
              result: 'CAPTURED',
              details: {
                order_id: razorpayOrder.order_id,
                payment_id: paymentResult.payment_id,
                amount_paise: amountPaise,
                order_status: paymentResult.order_status
              }
            });
          } catch (captureErr) {
            logDecision({
              event: 'DOWNSTREAM_CAPTURE_FAILED',
              mandate_id: mandateId,
              session_id: sessionId,
              result: 'CAPTURE_ERROR',
              details: { error: captureErr.message }
            });
          }
        } catch (orderErr) {
          logDecision({
            event: 'DOWNSTREAM_ORDER_CREATION_FAILED',
            mandate_id: mandateId,
            session_id: sessionId,
            result: 'ORDER_ERROR',
            details: { error: orderErr.message }
          });
          // Do NOT roll back state machine update! The authorization succeeded.
        }
      }
    } else if (finalDecision === 'STEP_UP' || finalDecision === 'ESCALATE') {
      // Reserve pending spend with 10-minute TTL (M1 Fix 3)
      await reservePendingSpend({
        mandate_id: mandateId,
        amount_paise: amountPaise,
        session_id: sessionId,
        ttl_ms: 600_000
      });
    }

    // 7. Record Hash-Chained Audit Trail Entry (M4 hooks)
    const auditEntry = await recordAuditEntry({
      session_id: sessionId,
      claimed_mandate: mandate,
      transaction: { ...transaction, razorpay_order: razorpayOrder },
      layer1_verifier: { result: 'pass', checks: gate1Result.checks_cleared },
      layer2_agent_trace: agentOutput.tool_trace,
      agent_recommendation: agentOutput.recommendation,
      final_decision: finalDecision,
      override_applied: safetyCheck.override_applied,
      reasoning: safetyCheck.effective_reasoning
    });

    const responsePayload = {
      session_id: sessionId,
      decision: finalDecision,
      override_applied: safetyCheck.override_applied,
      reasoning: safetyCheck.effective_reasoning,
      agent_recommendation: agentOutput.recommendation,
      anomaly_score: agentOutput.anomaly_score,
      state_snapshot: stateUpdateResult ? stateUpdateResult.state_snapshot : getStateSnapshot(mandateId),
      razorpay_order: razorpayOrder,
      razorpay_order_id: razorpayOrder?.order_id || null,
      audit_entry_hash: auditEntry.entry_hash
    };

    // Complete idempotency cache
    await completeRequest(mandateId, requestId, responsePayload);

    if (isStreaming) {
      sseEmitter({ type: 'final', data: responsePayload });
      return res.end();
    }

    return res.json(responsePayload);
  } catch (err) {
    await releaseRequest(mandateId, requestId);
    logDecision({
      event: 'AUTHORIZATION_ERROR',
      mandate_id: mandateId,
      session_id: sessionId,
      result: 'ERROR',
      details: { error: err.message }
    });

    if (isStreaming) {
      sseEmitter({ type: 'error', data: { error: 'INTERNAL_ERROR', message: err.message } });
      return res.end();
    }

    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

export default router;
