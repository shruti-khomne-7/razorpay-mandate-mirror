// backend/src/agent/guardRechecker.js
import { verifyDeterministicBounds } from '../core/deterministicVerifier.js';
import { logDecision } from '../core/auditLog.js';

/**
 * Deterministic Safety Layer: Re-checks the Agent's Recommendation
 *
 * Implements Fix 4: Directly delegates to verifyDeterministicBounds()
 * so Gate 1 and the guard re-checker can never silently drift apart.
 *
 * If the agent recommends 'CLEAR' but verifyDeterministicBounds() fails,
 * it forces an override to 'ESCALATE', emits an SSE override event if streaming,
 * and logs the safety intercept to the audit chain.
 */
export function recheckAgentRecommendation({
  mandate,
  transaction,
  stateSnapshot,
  agentRecommendation,
  secretKey,
  session_id,
  sseEmitter = null
}) {
  let finalDecision = agentRecommendation.recommendation;
  let overrideApplied = false;
  let overrideReason = null;

  if (agentRecommendation.recommendation === 'CLEAR') {
    // Re-verify against the exact deterministic bounds using the current state snapshot
    const boundCheck = verifyDeterministicBounds({
      mandate,
      transaction,
      stateSnapshot,
      secretKey,
      session_id
    });

    if (!boundCheck.passed) {
      finalDecision = 'ESCALATE';
      overrideApplied = true;
      overrideReason = `Safety Override: Agent recommended CLEAR, but deterministic verification failed: [${boundCheck.rule_cited}] ${boundCheck.reason}`;

      // Emit real-time SSE override event if streaming
      if (typeof sseEmitter === 'function') {
        sseEmitter({
          type: 'override',
          data: {
            original: 'CLEAR',
            overridden_to: 'ESCALATE',
            reason: overrideReason,
            rule_cited: boundCheck.rule_cited
          }
        });
      }

      logDecision({
        event: 'GUARD_OVERRIDE',
        mandate_id: mandate?.mandate_id,
        session_id,
        result: 'OVERRIDE_TO_ESCALATE',
        details: {
          original_recommendation: 'CLEAR',
          rule_cited: boundCheck.rule_cited,
          reason: boundCheck.reason
        }
      });
    }
  }

  return {
    final_decision: finalDecision,
    override_applied: overrideApplied,
    override_reason: overrideReason,
    effective_reasoning: overrideApplied
      ? `${agentRecommendation.reasoning} [OVERRIDDEN BY DETERMINISTIC VERIFIER: ${overrideReason}]`
      : agentRecommendation.reasoning
  };
}
