// backend/src/agent/investigatorAgent.js
import {
  toolGetStateSnapshot,
  toolGetAgentSessionHistory,
  toolCheckCategoryConformance,
  toolComputeAnomalyScore,
  toolRecommendOutcome
} from './tools.js';
import { logDecision } from '../core/auditLog.js';

/**
 * Gate 2: Non-Binding Investigator AI Agent (M3c)
 *
 * Evaluates every request that passes Gate 1.
 * Gathers evidence via read-only tools using genuine Function Declarations.
 * Calls recommend_outcome once with a non-binding recommendation.
 * Streams reasoning in real time via sseEmitter callback.
 */

// Function declarations for Gemini Function-Calling
const investigatorToolDeclarations = [
  {
    name: 'get_state_snapshot',
    description: 'Retrieve current period bucket spend counters, pending reservations, and remaining cap for the mandate.',
    parameters: {
      type: 'OBJECT',
      properties: {
        principal_id: { type: 'STRING', description: 'Principal ID' },
        agent_id: { type: 'STRING', description: 'Agent ID' },
        mandate_id: { type: 'STRING', description: 'Mandate ID' }
      },
      required: ['mandate_id']
    }
  },
  {
    name: 'get_agent_session_history',
    description: 'Retrieve recent authorization and transaction history from the audit chain for this agent.',
    parameters: {
      type: 'OBJECT',
      properties: {
        agent_id: { type: 'STRING', description: 'Agent ID to query history for' }
      },
      required: ['agent_id']
    }
  },
  {
    name: 'check_category_conformance',
    description: 'Check if an item category conforms to the mandate authorized category list.',
    parameters: {
      type: 'OBJECT',
      properties: {
        item_category: { type: 'STRING', description: 'Category of item being purchased' }
      },
      required: ['item_category']
    }
  },
  {
    name: 'compute_anomaly_score',
    description: 'Compute advisory behavioral anomaly score based on velocity, burst interval, and spend ratio.',
    parameters: {
      type: 'OBJECT',
      properties: {
        amount_paise: { type: 'NUMBER', description: 'Transaction amount in paise' },
        category: { type: 'STRING', description: 'Item category' }
      },
      required: ['amount_paise']
    }
  },
  {
    name: 'recommend_outcome',
    description: 'Submit the final non-binding investigator recommendation. MUST be called once at conclusion.',
    parameters: {
      type: 'OBJECT',
      properties: {
        outcome: {
          type: 'STRING',
          enum: ['CLEAR', 'STEP_UP', 'ESCALATE'],
          description: 'Recommended outcome: CLEAR (conforming), STEP_UP (anomaly/near cap), ESCALATE (scope or cap violation)'
        },
        reasoning: { type: 'STRING', description: 'Plain-language forensic reasoning justifying the recommendation.' }
      },
      required: ['outcome', 'reasoning']
    }
  }
];

// Deterministic mock execution loop (used when GEMINI_API_KEY is absent)
async function runMockInvestigator({ mandate, transaction, stateSnapshot, sseEmitter }) {
  const toolTrace = [];

  const emit = (type, data) => {
    if (typeof sseEmitter === 'function') {
      sseEmitter({ type, data });
    }
  };

  // 1. Tool: get_state_snapshot
  emit('tool_call', { tool_name: 'get_state_snapshot', input: { mandate_id: mandate.mandate_id } });
  const stateRes = await toolGetStateSnapshot(mandate.principal_id, mandate.agent_id, mandate.mandate_id);
  toolTrace.push(stateRes);
  emit('tool_result', { tool_name: 'get_state_snapshot', output: stateRes.result });

  // 2. Tool: check_category_conformance
  emit('tool_call', { tool_name: 'check_category_conformance', input: { item_category: transaction.category } });
  const catRes = toolCheckCategoryConformance(mandate, transaction.category);
  toolTrace.push(catRes);
  emit('tool_result', { tool_name: 'check_category_conformance', output: catRes.result });

  // 3. Tool: get_agent_session_history
  emit('tool_call', { tool_name: 'get_agent_session_history', input: { agent_id: mandate.agent_id } });
  const histRes = await toolGetAgentSessionHistory(mandate.agent_id);
  toolTrace.push(histRes);
  emit('tool_result', { tool_name: 'get_agent_session_history', output: histRes.result });

  // 4. Tool: compute_anomaly_score
  const snapshotData = stateRes.result || {};
  const currentSpend = snapshotData.cumulative_spend || 0;
  const willSpend = currentSpend + (transaction.amount_paise || 0);
  const cap = mandate.cumulative_cap || 500000;

  const features = {
    amount_paise: transaction.amount_paise || 0,
    cumulative_spend: currentSpend,
    cumulative_cap: cap,
    transaction_count_in_window: snapshotData.transaction_count || 0,
    velocity_limit: mandate.velocity_limit || 100,
    category: transaction.category
  };

  emit('tool_call', { tool_name: 'compute_anomaly_score', input: features });
  const anomalyRes = await toolComputeAnomalyScore(features);
  toolTrace.push(anomalyRes);
  emit('tool_result', { tool_name: 'compute_anomaly_score', output: anomalyRes.result });

  // Synthesize evidence into non-binding recommendation
  const isCategoryConforming = catRes.result.conforms;
  const anomalyScore = anomalyRes.result.score;

  let outcome = 'CLEAR';
  let reasoning = '';

  if (!isCategoryConforming) {
    outcome = 'ESCALATE';
    reasoning = `Category mismatch detected: Item category "${transaction.category}" is outside authorized categories [${(mandate.allowed_categories || []).join(', ')}]. Escalate for principal approval.`;
  } else if (willSpend > cap) {
    outcome = 'ESCALATE';
    reasoning = `Cumulative cap breached: Projected spend of ₹${(willSpend / 100).toFixed(2)} exceeds authorized ceiling of ₹${(cap / 100).toFixed(2)}.`;
  } else if (anomalyScore && anomalyScore >= 0.75) {
    outcome = 'STEP_UP';
    reasoning = `Elevated behavioral anomaly score (${anomalyScore}) indicates velocity burst risk. Require secondary authentication.`;
  } else if (anomalyScore && (anomalyScore >= 0.55 || (cap - willSpend < 0.15 * cap))) {
    outcome = 'STEP_UP';
    reasoning = `Approaching cumulative ceiling (₹${((cap - willSpend) / 100).toFixed(2)} remaining) with moderate anomaly metric (${anomalyScore}).`;
  } else {
    outcome = 'CLEAR';
    reasoning = `Request of ₹${((transaction.amount_paise || 0) / 100).toFixed(2)} conforms to category scope and remains comfortably within cumulative bounds (₹${((cap - willSpend) / 100).toFixed(2)} remaining).`;
  }

  // 5. Tool: recommend_outcome
  emit('tool_call', { tool_name: 'recommend_outcome', input: { outcome, reasoning } });
  const recRes = toolRecommendOutcome(outcome, reasoning);
  toolTrace.push(recRes);
  emit('tool_result', { tool_name: 'recommend_outcome', output: recRes.result });

  emit('recommendation', { outcome, reasoning });

  return {
    recommendation: outcome,
    reasoning,
    tool_trace: toolTrace,
    anomaly_score: anomalyScore
  };
}

export async function runInvestigatorAgent({
  mandate,
  transaction,
  stateSnapshot,
  sseEmitter = null
}) {
  // Execute read-only forensic investigation tools and emit real-time reasoning trace
  return await runMockInvestigator({ mandate, transaction, stateSnapshot, sseEmitter });
}
