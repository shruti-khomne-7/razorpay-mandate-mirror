// backend/src/agent/tools.js
import axios from 'axios';
import { getStateSnapshot } from '../core/stateMachine.js';
import { logDecision } from '../core/auditLog.js';
import { store } from '../db/store.js';

/**
 * Tool 1: Read-only Mandate & Cumulative State Snapshot
 */
export async function toolGetStateSnapshot(principalId, agentId, mandateId) {
  const snapshot = getStateSnapshot(mandateId);
  const result = snapshot || {
    mandate_id: mandateId,
    principal_id: principalId,
    agent_id: agentId,
    cumulative_spend: 0,
    pending_spend: 0,
    remaining_cap: 500000,
    transaction_count: 0
  };

  logDecision({
    event: 'TOOL_INVOCATION',
    mandate_id: mandateId,
    agent_id: agentId,
    result: 'OK',
    details: { tool: 'get_state_snapshot', result }
  });

  return {
    tool: 'get_state_snapshot',
    result
  };
}

/**
 * Tool 2: Agent Historical Session Activity
 * Returns last 10 entries from store.auditLogs for this agent
 */
export async function toolGetAgentSessionHistory(agentId) {
  const logs = store.auditLogs || [];
  const agentLogs = logs
    .filter(log => log.agent_id === agentId || log.claimed_mandate?.agent_id === agentId)
    .slice(-10)
    .map(log => ({
      session_id: log.session_id,
      timestamp: log.timestamp,
      event: log.event,
      amount_paise: log.transaction?.amount_paise || log.details?.amount_paise,
      category: log.transaction?.category,
      final_decision: log.final_decision || log.result,
      reasoning: log.reasoning
    }));

  const result = {
    agent_id: agentId,
    recent_sessions_count: agentLogs.length,
    recent_history: agentLogs
  };

  logDecision({
    event: 'TOOL_INVOCATION',
    agent_id: agentId,
    result: 'OK',
    details: { tool: 'get_agent_session_history', sessions_retrieved: agentLogs.length }
  });

  return {
    tool: 'get_agent_session_history',
    result
  };
}

/**
 * Tool 3: Category Conformance & Semantic Scope
 * Checks category against mandate allowed_categories
 */
export function toolCheckCategoryConformance(mandate, itemCategory) {
  const allowed = mandate.allowed_categories || [];
  const normalizedItem = (itemCategory || '').toLowerCase().trim();
  const directMatch = allowed.some(c => c.toLowerCase().trim() === normalizedItem);

  const result = {
    conforms: directMatch,
    item_category: itemCategory,
    allowed_categories: allowed,
    details: directMatch
      ? `Category "${itemCategory}" is authorized in mandate.`
      : `Category "${itemCategory}" is outside allowed categories: [${allowed.join(', ')}].`
  };

  logDecision({
    event: 'TOOL_INVOCATION',
    mandate_id: mandate?.mandate_id,
    result: directMatch ? 'CONFORMS' : 'BREACH',
    details: { tool: 'check_category_conformance', result }
  });

  return {
    tool: 'check_category_conformance',
    result
  };
}

/**
 * Tool 4: Advisory Anomaly Scoring Service (FastAPI or local fallback)
 * CRITICAL CONSTRAINT: compute_anomaly_score times out gracefully and returns
 * { score: null, source: "timeout" } — authorization NEVER blocks on scorer availability!
 */
export async function toolComputeAnomalyScore(features) {
  const ML_SCORER_URL = process.env.ML_SCORER_URL || 'http://127.0.0.1:8001/score';

  try {
    const res = await axios.post(ML_SCORER_URL, features, { timeout: 300 });
    const result = {
      score: res.data.anomaly_score,
      is_anomalous: res.data.is_anomalous,
      features_analyzed: features,
      source: 'fastapi_ml_service'
    };

    logDecision({
      event: 'TOOL_INVOCATION',
      result: 'OK',
      details: { tool: 'compute_anomaly_score', score: result.score, source: result.source }
    });

    return {
      tool: 'compute_anomaly_score',
      result
    };
  } catch (err) {
    // If connection refused or timeout, never block! Return advisory fallback or timeout note
    const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
    
    // Calculate lightweight local heuristic as fallback
    const velocityFactor = Math.min(1, (features.transaction_count_in_window || 0) / (features.velocity_limit || 100));
    const spendFactor = features.cumulative_cap ? (features.amount_paise / features.cumulative_cap) : 0.1;
    const interArrival = features.seconds_since_last_txn !== undefined ? features.seconds_since_last_txn : 3600;
    const burstRisk = interArrival < 30 ? 0.3 : 0;
    const heuristicScore = Math.min(1, Number((velocityFactor * 0.4 + spendFactor * 0.3 + burstRisk).toFixed(2)));

    const result = {
      score: isTimeout ? null : heuristicScore,
      is_anomalous: heuristicScore > 0.65,
      source: isTimeout ? 'timeout' : 'local_heuristic_fallback',
      message: 'Scorer unavailable or timed out; non-blocking advisory score used.'
    };

    logDecision({
      event: 'TOOL_INVOCATION',
      result: 'ADVISORY_FALLBACK',
      details: { tool: 'compute_anomaly_score', isTimeout, source: result.source }
    });

    return {
      tool: 'compute_anomaly_score',
      result
    };
  }
}

/**
 * Tool 5: Recommend Outcome (The Investigator's sole non-binding write action)
 * outcome ∈ { CLEAR, STEP_UP, ESCALATE }
 * reasoning is a plain-language string.
 * DOES NOT execute anything.
 */
export function toolRecommendOutcome(outcome, reasoning) {
  const validOutcomes = ['CLEAR', 'STEP_UP', 'ESCALATE'];
  const normalizedOutcome = validOutcomes.includes(outcome) ? outcome : 'ESCALATE';

  const result = {
    outcome: normalizedOutcome,
    reasoning: reasoning || 'Investigator synthesized evaluation.'
  };

  logDecision({
    event: 'INVESTIGATOR_RECOMMENDATION',
    result: normalizedOutcome,
    details: result
  });

  return {
    tool: 'recommend_outcome',
    result
  };
}
