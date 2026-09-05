// backend/src/core/auditChain.js
import crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';
import { store } from '../db/store.js';

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Computes SHA-256 hash for an audit entry chained to its predecessor.
 * Form: sha256(prev_entry_hash + canonical_json(entry_without_hashes))
 */
export function computeEntryHash(entryWithoutHashes, prevEntryHash) {
  const canonicalBody = stringify(entryWithoutHashes);
  return crypto
    .createHash('sha256')
    .update(prevEntryHash + canonicalBody)
    .digest('hex');
}

/**
 * Append a structured, cryptographically hash-chained decision entry to store.auditLogs.
 * Every decision point from M1 onward flows through here.
 */
export function logDecision({
  event,
  mandate_id = null,
  bucket_key = null,
  session_id = null,
  result = null,
  details = null,
  timestamp = null,
  // Optional extra metadata for backward compatibility
  transaction = null,
  agent_id = null,
  layer1_verifier = null,
  layer2_agent_trace = null,
  agent_recommendation = null,
  final_decision = null,
  override_applied = false,
  reasoning = null
}) {
  const logs = store.auditLogs;
  const index = logs.length;
  const prev_entry_hash = index > 0 && logs[index - 1].entry_hash ? logs[index - 1].entry_hash : GENESIS_HASH;

  const entryPayload = {
    index,
    event,
    mandate_id: mandate_id ?? null,
    bucket_key: bucket_key ?? null,
    session_id: session_id ?? null,
    agent_id: agent_id ?? null,
    result: result ?? final_decision ?? null,
    details: details ?? null,
    timestamp: timestamp ?? new Date().toISOString(),
    // Backward compatibility context fields
    transaction: transaction ?? null,
    layer1_verifier: layer1_verifier ?? null,
    layer2_agent_trace: layer2_agent_trace ?? null,
    agent_recommendation: agent_recommendation ?? null,
    final_decision: final_decision ?? result ?? null,
    override_applied: !!override_applied,
    reasoning: reasoning ?? (typeof details === 'string' ? details : null)
  };

  const entry_hash = computeEntryHash(entryPayload, prev_entry_hash);

  const chainedEntry = {
    ...entryPayload,
    prev_entry_hash,
    entry_hash
  };

  store.appendAuditLog(chainedEntry);
  return chainedEntry;
}

/**
 * Alias for backward compatibility with earlier route callers.
 */
export async function recordAuditEntry(entryData) {
  return logDecision(entryData);
}

/**
 * Replays the entire historical audit chain from Genesis to tip.
 * Detects any tampered, modified, or deleted records.
 * Returns { valid: true, count } or { valid: false, tampered_at_index: N, reason: "..." }
 */
export function verifyAuditChain() {
  const logs = store.auditLogs;

  if (!logs || logs.length === 0) {
    return { valid: true, count: 0, message: 'Audit chain is empty.' };
  }

  for (let i = 0; i < logs.length; i++) {
    const current = logs[i];

    const expectedPrevHash = i === 0 ? GENESIS_HASH : logs[i - 1].entry_hash;

    // 1. Verify parent hash link integrity
    if (current.prev_entry_hash !== expectedPrevHash) {
      return {
        valid: false,
        tampered_at_index: i,
        session_id: current.session_id,
        reason: 'BROKEN_PARENT_HASH_LINK',
        expected_prev_hash: expectedPrevHash,
        actual_prev_hash: current.prev_entry_hash
      };
    }

    // 2. Verify content hash integrity
    const { prev_entry_hash, entry_hash, ...entryWithoutHashes } = current;
    const computedHash = computeEntryHash(entryWithoutHashes, expectedPrevHash);

    if (entry_hash !== computedHash) {
      return {
        valid: false,
        tampered_at_index: i,
        session_id: current.session_id,
        reason: 'HASH_MISMATCH_DATA_TAMPERED',
        expected_hash: computedHash,
        actual_hash: entry_hash
      };
    }
  }

  return {
    valid: true,
    count: logs.length,
    latest_hash: logs[logs.length - 1].entry_hash,
    message: `SHA-256 Audit Chain verified: ${logs.length} entries intact.`
  };
}
