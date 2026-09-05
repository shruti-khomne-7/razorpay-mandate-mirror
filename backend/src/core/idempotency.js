// backend/src/core/idempotency.js
import { store } from '../db/store.js';
import { logDecision } from './auditLog.js';

const INFLIGHT_TIMEOUT_MS = 30_000; // 30 seconds
const SWEEP_INTERVAL_MS = 60_000;   // 60 seconds
let sweepTimer = null;

function idempotencyKey(mandateId, requestId) {
  return `${mandateId}:${requestId}`;
}

/**
 * Atomically claim a request_id for processing.
 *
 * Three-state lifecycle: absent → IN_FLIGHT → COMPLETED (or FAILED).
 *
 * - If absent: inserts IN_FLIGHT, returns { claimed: true }.
 * - If IN_FLIGHT: returns { claimed: false, existing: { status: 'IN_FLIGHT' } }.
 *   The caller should respond 409 "still processing."
 * - If COMPLETED: returns { claimed: false, existing: { status: 'COMPLETED', result } }.
 *   The caller should replay the cached result (idempotent).
 * - If FAILED (from sweep): allows reclaim — inserts IN_FLIGHT, returns { claimed: true }.
 */
export async function claimRequest(mandateId, requestId) {
  if (!requestId) return { claimed: true };

  const key = idempotencyKey(mandateId, requestId);

  return await store.runAtomic(`idem:${key}`, () => {
    const existing = store.idempotency.get(key);

    if (!existing) {
      store.setIdempotency(key, {
        status: 'IN_FLIGHT',
        claimed_at: Date.now(),
        result: null
      });
      return { claimed: true };
    }

    // A previously failed/timed-out request — allow retry
    if (existing.status === 'FAILED') {
      store.setIdempotency(key, {
        status: 'IN_FLIGHT',
        claimed_at: Date.now(),
        result: null
      });
      return { claimed: true };
    }

    return { claimed: false, existing: { ...existing } };
  });
}

/**
 * Mark a claimed request as completed with its cached result.
 */
export async function completeRequest(mandateId, requestId, result) {
  if (!requestId) return;
  const key = idempotencyKey(mandateId, requestId);

  await store.runAtomic(`idem:${key}`, () => {
    const rec = store.idempotency.get(key);
    store.setIdempotency(key, {
      status: 'COMPLETED',
      claimed_at: rec?.claimed_at ?? Date.now(),
      completed_at: Date.now(),
      result
    });
  });
}

/**
 * Release a claimed request on processing failure, so it can be retried.
 */
export async function releaseRequest(mandateId, requestId) {
  if (!requestId) return;
  const key = idempotencyKey(mandateId, requestId);
  store.idempotency.delete(key);
}

/**
 * Background sweep: moves any IN_FLIGHT record older than 30s to FAILED.
 * Prevents a crashed request from permanently blocking that request_id.
 */
function sweepStaleInflight() {
  const now = Date.now();
  for (const [key, record] of store.idempotency.entries()) {
    if (record.status === 'IN_FLIGHT' && (now - record.claimed_at) > INFLIGHT_TIMEOUT_MS) {
      record.status = 'FAILED';
      record.failed_at = now;
      record.reason = 'IN_FLIGHT_TIMEOUT';
      logDecision({
        event: 'IDEMPOTENCY_SWEEP',
        session_id: key,
        result: 'FAILED',
        details: `IN_FLIGHT record for ${key} timed out after ${INFLIGHT_TIMEOUT_MS}ms`
      });
    }
  }
}

export function startSweepInterval() {
  if (sweepTimer) return;
  sweepTimer = setInterval(sweepStaleInflight, SWEEP_INTERVAL_MS);
  if (sweepTimer.unref) sweepTimer.unref();
}

export function stopSweepInterval() {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}
