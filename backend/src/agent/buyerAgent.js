// backend/src/agent/buyerAgent.js
import axios from 'axios';
import { logDecision } from '../core/auditLog.js';
import { callGemini, extractText } from './geminiClient.js';

/**
 * Autonomous Buyer Agent (M3a)
 *
 * Simulates an external autonomous purchasing agent acting on a principal's goal.
 * STRICT ARCHITECTURAL CONSTRAINTS:
 * 1. Has NO ACCESS to stateMachine, mandateSigner, store, or internal verifiers.
 * 2. Interacts with Mandate Mirror SOLELY as an HTTP client via /api/v1/authorize.
 * 3. Two LLM calls:
 *    Call 1: Purchase decision (item, category, merchant, amount_paise, reasoning)
 *    Call 2: Block explanation (if auth outcome is not CLEAR, translates structured block into plain language)
 * 4. Calls logDecision() at every decision point.
 */

// Fallback deterministic decision logic when GEMINI_API_KEY is not set
function planPurchaseMock(goal, mandate) {
  const text = (goal || '').toLowerCase();

  // Scenario: category mismatch
  if (text.includes('charger') || text.includes('phone') || text.includes('electronics') || text.includes('headphone')) {
    return {
      item_name: 'Anker USB-C Cable & Phone Accessories',
      category: 'consumer_electronics',
      merchant_id: 'amazon',
      amount_paise: 55000, // ₹550.00 (within ₹800 per-txn cap so category breach is isolated)
      reasoning: 'Principal requested electronic accessories; selected USB-C accessories.'
    };
  }

  // Scenario: high price / cap breach
  if (text.includes('bulk') || text.includes('luxury') || text.includes('expensive') || text.includes('5000') || text.includes('10000')) {
    return {
      item_name: 'Premium Gourmet Imported Olive Oil & Saffron Set',
      category: 'grocery',
      merchant_id: (mandate?.merchant_allowlist && mandate.merchant_allowlist[0]) || 'blinkit',
      amount_paise: 480000, // ₹4,800.00
      reasoning: 'Selected premium artisanal ingredients matching the requested gourmet goal.'
    };
  }

  // Extract explicit amount if mentioned e.g. "₹1,500" or "1500" or "800"
  let amountPaise = 45000; // default ₹450
  const amtMatch = text.match(/₹?\s*(\d[\d,]*)/);
  if (amtMatch) {
    const rawVal = parseInt(amtMatch[1].replace(/,/g, ''), 10);
    if (rawVal > 0) {
      amountPaise = rawVal * 100;
    }
  }

  const category = (mandate?.allowed_categories && mandate.allowed_categories[0]) || 'grocery';
  const merchant = (mandate?.merchant_allowlist && mandate.merchant_allowlist[0]) || 'blinkit';

  return {
    item_name: 'Weekly Fresh Produce & Pantry Essentials',
    category,
    merchant_id: merchant,
    amount_paise: amountPaise,
    reasoning: `Selected staples matching the principal goal within the estimated target of ₹${(amountPaise / 100).toFixed(2)}.`
  };
}

// Fallback deterministic block explanation generator
function generateBlockExplanationMock(authOutcome, mandate, purchasePlan) {
  const reason = authOutcome.rule_cited || authOutcome.reason || 'TRANSACTION_REJECTED';
  const amountFormatted = `₹${(purchasePlan.amount_paise / 100).toFixed(2)}`;

  switch (reason) {
    case 'CUMULATIVE_CAP_EXCEEDED':
    case 'CUMULATIVE_CAP_BREACH':
      return `I couldn't complete this order of ${amountFormatted} because your monthly spending cap has been reached. Mandate Mirror stopped the transaction so you don't overspend. You can either wait until your spending window resets at the start of next month, or increase your cumulative budget in the mandate dashboard.`;

    case 'PER_TXN_CAP_BREACH':
    case 'PER_TXN_CAP_EXCEEDED':
      const perTxnCap = mandate?.spend_cap_per_txn ? `₹${(mandate.spend_cap_per_txn / 100).toFixed(2)}` : 'the per-order ceiling';
      return `This purchase of ${amountFormatted} was blocked because it exceeds your single-transaction limit of ${perTxnCap}. To proceed, you can ask me to split the purchase into smaller baskets, select a lower-cost alternative, or raise your per-transaction cap.`;

    case 'UNAUTHORIZED_CATEGORY':
      const allowedCats = (mandate?.allowed_categories || []).join(', ');
      return `I tried to purchase "${purchasePlan.item_name}" under the category "${purchasePlan.category}", but your mandate only authorizes: [${allowedCats}]. The security gate blocked it to keep my authority tightly bounded. If you want me to buy these items, please update your mandate to include "${purchasePlan.category}".`;

    case 'UNAUTHORIZED_MERCHANT':
      const allowedMerchants = (mandate?.merchant_allowlist || []).join(', ');
      return `I attempted to purchase from merchant "${purchasePlan.merchant_id}", which is not on your approved merchant allowlist: [${allowedMerchants}]. To protect your payment account, transactions are restricted to verified merchants. You can add "${purchasePlan.merchant_id}" to your mandate allowlist if you approve.`;

    case 'MANDATE_EXPIRED':
      return `Your mandate expired on ${mandate?.valid_until ? new Date(mandate.valid_until).toLocaleDateString() : 'recently'}. All automated transactions are frozen until you renew the delegation agreement.`;

    case 'SIGNATURE_INVALID':
      return `The transaction was rejected because the cryptographic signature on the mandate failed verification. This prevents tampered or corrupted mandates from being processed.`;

    default:
      return `The transaction could not be pre-authorized: ${authOutcome.reason || reason}. Please review your mandate parameters or review the audit log.`;
  }
}

/**
 * Execute Buyer Agent loop
 */
export async function runBuyerAgent({
  goal,
  mandate,
  agent_id,
  targetUrl = 'http://127.0.0.1:5000/api/v1/authorize'
}) {
  const agentId = agent_id || mandate?.agent_id || 'buyer_agent_01';
  const apiKey = process.env.GEMINI_API_KEY;

  // ────────────────────────────────────────────────────────────────────
  // Call 1: Purchase Planning Decision
  // ────────────────────────────────────────────────────────────────────
  let purchasePlan = null;

  if (apiKey && apiKey.trim() !== '') {
    try {
      const prompt1 = `You are an autonomous AI purchasing agent acting on behalf of a principal.
Goal: "${goal}"
Available Mandate Constraints:
- Allowed Categories: ${JSON.stringify(mandate?.allowed_categories || [])}
- Approved Merchants: ${JSON.stringify(mandate?.merchant_allowlist || [])}
- Max Per-Txn: ₹${((mandate?.spend_cap_per_txn || 80000) / 100).toFixed(2)}
- Cumulative Monthly Cap: ₹${((mandate?.cumulative_cap || 500000) / 100).toFixed(2)}

Decide on a specific, realistic purchase to satisfy the goal.
IMPORTANT: Select "category" matching the goal from the Allowed Categories list if suitable. If Approved Merchants are specified, select "merchant_id" from that list.

OUTPUT JSON ONLY:
{
  "item_name": "string (specific product title)",
  "category": "string (exact category string from Allowed Categories if applicable, or relevant category)",
  "merchant_id": "string (merchant identifier)",
  "amount_paise": integer (amount in paise, ₹1 = 100 paise),
  "reasoning": "string (why you selected this item and amount)"
}`;

      console.log('[BuyerAgent] Calling Gemini (gemini-3.6-flash default) via fetch (Call 1)...');
      const geminiResp1 = await callGemini(prompt1, {
        temperature: 0.2,
        responseMimeType: 'application/json',
        model: 'gemini-3.6-flash'
      });
      const rawText1 = extractText(geminiResp1);
      purchasePlan = JSON.parse(rawText1);
      console.log('[BuyerAgent] REAL Gemini plan used:', purchasePlan.item_name, '| Category:', purchasePlan.category, '| Amount (paise):', purchasePlan.amount_paise);
    } catch (err) {
      console.warn('[BuyerAgent] LLM Call 1 fallback to mock (Error:', err.message, ')');
      purchasePlan = planPurchaseMock(goal, mandate);
      console.log('[BuyerAgent] MOCK fallback plan used:', purchasePlan.item_name);
    }
  } else {
    console.log('[BuyerAgent] No GEMINI_API_KEY set — using MOCK fallback plan');
    purchasePlan = planPurchaseMock(goal, mandate);
    console.log('[BuyerAgent] MOCK fallback plan used:', purchasePlan.item_name);
  }

  logDecision({
    event: 'BUYER_DECISION_PLANNED',
    mandate_id: mandate?.mandate_id,
    agent_id: agentId,
    result: 'PLANNED',
    details: purchasePlan
  });

  // ────────────────────────────────────────────────────────────────────
  // Transact: External HTTP Call to /api/v1/authorize
  // Notice: Buyer Agent is purely an HTTP client! No internal imports.
  // ────────────────────────────────────────────────────────────────────
  const requestId = `req_buyer_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const transactionPayload = {
    amount_paise: purchasePlan.amount_paise,
    category: purchasePlan.category,
    merchant: purchasePlan.merchant_id,
    item_name: purchasePlan.item_name,
    nonce: `nonce_${requestId}`,
    timestamp: new Date().toISOString()
  };

  let authOutcome = null;

  try {
    const authRes = await axios.post(
      targetUrl,
      {
        mandate,
        transaction: transactionPayload,
        session_id: requestId,
        request_id: requestId
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': requestId
        },
        timeout: 30000
      }
    );
    authOutcome = authRes.data;
  } catch (err) {
    if (err.response && err.response.data) {
      authOutcome = err.response.data;
    } else {
      authOutcome = {
        decision: 'HARD-BLOCK',
        reason: err.message,
        rule_cited: 'NETWORK_OR_GATEWAY_ERROR'
      };
    }
  }

  logDecision({
    event: 'BUYER_AUTH_RESULT',
    mandate_id: mandate?.mandate_id,
    agent_id: agentId,
    session_id: requestId,
    result: authOutcome.decision || 'UNKNOWN',
    details: {
      auth_outcome: authOutcome,
      purchase_plan: purchasePlan
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // Call 2: Block Explanation (Only if decision is not CLEAR)
  // ────────────────────────────────────────────────────────────────────
  let principalExplanation = null;

  if (authOutcome.decision !== 'CLEAR') {
    if (apiKey && apiKey.trim() !== '') {
      try {
        const prompt2 = `You are a helpful personal purchasing AI assistant explaining a blocked payment to your non-technical user (principal).
The pre-authorization gateway "Mandate Mirror" blocked the checkout.

Context:
- User Goal: "${goal}"
- What you tried to buy: "${purchasePlan.item_name}" for ₹${(purchasePlan.amount_paise / 100).toFixed(2)} under category "${purchasePlan.category}" at "${purchasePlan.merchant_id}".
- Gateway Decision: "${authOutcome.decision}"
- Rule Cited: "${authOutcome.rule_cited || authOutcome.reason}"
- Gateway Details: ${JSON.stringify(authOutcome.details || authOutcome.reason || '')}

Write a clear, empathetic, 2-3 sentence plain language explanation for your user:
1. Explain what was blocked and why in friendly terms (no raw technical error codes).
2. Advise the user on actionable next steps (e.g. increase spending limit, wait for window reset, approve a new category, or choose a different item).`;

        console.log('[BuyerAgent] Calling Gemini (Call 2 - explanation)...');
        const geminiResp2 = await callGemini(prompt2, {
          temperature: 0.3,
          model: 'gemini-3.6-flash'
        });
        principalExplanation = extractText(geminiResp2)?.trim();
        console.log('[BuyerAgent] REAL Gemini explanation generated');
      } catch (err) {
        console.warn('[BuyerAgent] LLM Call 2 fallback to mock (Error:', err.message, ')');
        principalExplanation = generateBlockExplanationMock(authOutcome, mandate, purchasePlan);
        console.log('[BuyerAgent] MOCK fallback explanation used');
      }
    } else {
      console.log('[BuyerAgent] No GEMINI_API_KEY set — using MOCK fallback explanation');
      principalExplanation = generateBlockExplanationMock(authOutcome, mandate, purchasePlan);
      console.log('[BuyerAgent] MOCK fallback explanation used');
    }

    logDecision({
      event: 'BUYER_EXPLANATION_GENERATED',
      mandate_id: mandate?.mandate_id,
      agent_id: agentId,
      session_id: requestId,
      result: 'EXPLAINED',
      details: { explanation: principalExplanation }
    });
  } else {
    const payId = authOutcome.razorpay_order?.payment_id ? ` (Payment ID: ${authOutcome.razorpay_order.payment_id}, Status: ${authOutcome.razorpay_order.payment_status || 'captured'})` : '';
    principalExplanation = `Purchase successfully completed! Razorpay test payment captured for "${purchasePlan.item_name}" (₹${(purchasePlan.amount_paise / 100).toFixed(2)}) at ${purchasePlan.merchant_id}${payId}.`;
  }

  return {
    success: true,
    purchase_plan: purchasePlan,
    transaction: transactionPayload,
    auth_outcome: authOutcome,
    principal_explanation: principalExplanation
  };
}
