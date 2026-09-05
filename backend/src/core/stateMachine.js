// backend/src/core/stateMachine.js
import { store } from '../db/store.js';
import { logDecision } from './auditLog.js';
import { atomicMongoBucketSpend, isMongoConnected, getDb } from '../db/mongo.js';
import { verifyMandateSignature } from './mandateSigner.js';

// ── Period key computation ────────────────────────────────────────────

export function windowToPeriodType(windowStr) {
  if (!windowStr) return 'monthly';
  if (/^P1M$/i.test(windowStr)) return 'monthly';
  if (/^P30D$/i.test(windowStr)) return 'monthly';
  if (/^P1D$/i.test(windowStr)) return 'daily';
  if (/^PT1H$/i.test(windowStr)) return 'hourly';
  if (/^PT\d+M$/i.test(windowStr)) return 'minute';
  return 'monthly';
}

export function computePeriodKey(periodType, timestampMs) {
  const d = new Date(timestampMs);
  const Y = d.getUTCFullYear();
  const M = String(d.getUTCMonth() + 1).padStart(2, '0');
  const D = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');

  switch (periodType) {
    case 'monthly':  return `${Y}-${M}`;
    case 'daily':    return `${Y}-${M}-${D}`;
    case 'hourly':   return `${Y}-${M}-${D}T${h}`;
    case 'minute':   return `${Y}-${M}-${D}T${h}:${m}`;
    default:         return `${Y}-${M}`;
  }
}

export function computeBucketKey(mandateId, periodKey) {
  return `${mandateId}_${periodKey}`;
}

// ── Mandate config registration ───────────────────────────────────────

const DEFAULT_RESERVATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isValidTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validateMandateNumbers(mandate) {
  if (!isPositiveSafeInteger(mandate?.spend_cap_per_txn)) return 'INVALID_PER_TXN_CAP';
  if (!isPositiveSafeInteger(mandate?.cumulative_cap)) return 'INVALID_CUMULATIVE_CAP';
  if (!isPositiveSafeInteger(mandate?.velocity_limit)) return 'INVALID_VELOCITY_LIMIT';
  if (!isValidTimestamp(mandate?.valid_from) || !isValidTimestamp(mandate?.valid_until)) return 'INVALID_VALIDITY_WINDOW';
  if (Date.parse(mandate.valid_until) <= Date.parse(mandate.valid_from)) return 'INVALID_VALIDITY_WINDOW';
  return null;
}

function validateSpendRequest(config, amount_paise, nowMs) {
  if (config.status !== 'ACTIVE') {
    return { success: false, reason: `MANDATE_${config.status}`, details: `Mandate is ${config.status}` };
  }
  if (!Number.isSafeInteger(amount_paise) || amount_paise <= 0) {
    return { success: false, reason: 'INVALID_TRANSACTION_AMOUNT', details: 'amount_paise must be a positive safe integer.' };
  }
  if (amount_paise > config.spend_cap_per_txn) {
    return { success: false, reason: 'PER_TXN_CAP_EXCEEDED', details: `${amount_paise} paise exceeds per-txn cap of ${config.spend_cap_per_txn} paise` };
  }
  const validFrom = Date.parse(config.valid_from);
  const validUntil = Date.parse(config.valid_until);
  if (!Number.isFinite(validFrom) || !Number.isFinite(validUntil) || validUntil <= validFrom) {
    return { success: false, reason: 'INVALID_VALIDITY_WINDOW', details: 'Stored mandate validity window is invalid.' };
  }
  if (nowMs < validFrom) return { success: false, reason: 'MANDATE_NOT_YET_VALID', details: `Mandate is valid from ${config.valid_from}` };
  if (nowMs > validUntil) return { success: false, reason: 'MANDATE_EXPIRED', details: `Mandate expired at ${config.valid_until}` };
  return null;
}

/**
 * Register a mandate's configuration.
 * Config is stored separately from spend buckets — no counters live here.
 *
 * GUARD: this function refuses to register any mandate that does not carry
 * a valid HMAC signature. This closes the loophole where a seed script,
 * benchmark script, or any future caller could insert a mandate directly
 * into the store without going through signMandate() / POST
 * /api/v1/mandates/confirm. If this throws, find the caller and fix it
 * to sign the mandate first — never remove this check to work around it.
 */
export function registerMandate(mandate) {
  const sigCheck = verifyMandateSignature(mandate);
  if (!sigCheck.valid) {
    throw new Error(
      `REGISTER_REJECTED: mandate ${mandate?.mandate_id || '(unknown)'} has no valid signature (${sigCheck.reason}). ` +
      `Mandates must be signed via signMandate() before calling registerMandate().`
    );
  }

  const numericValidationError = validateMandateNumbers(mandate);
  if (numericValidationError) {
    throw new Error(`REGISTER_REJECTED: mandate ${mandate?.mandate_id || '(unknown)'} has ${numericValidationError}.`);
  }

  const existing = store.mandateConfigs.get(mandate.mandate_id);
  if (existing && (mandate.mandate_version || 1) <= existing.version) {
    if (mandate.signature) {
      if (!existing.signature) existing.signature = mandate.signature;
      if (existing.raw_mandate && !existing.raw_mandate.signature) existing.raw_mandate.signature = mandate.signature;
    }
    return existing;
  }

  const config = {
    mandate_id: mandate.mandate_id,
    principal_id: mandate.principal_id,
    agent_id: mandate.agent_id,
    version: mandate.mandate_version || 1,
    spend_cap_per_txn: mandate.spend_cap_per_txn,
    cumulative_cap: mandate.cumulative_cap,
    cumulative_window: mandate.cumulative_window || 'P30D',
    period_type: windowToPeriodType(mandate.cumulative_window),
    velocity_limit: mandate.velocity_limit,
    allowed_categories: mandate.allowed_categories || [],
    merchant_allowlist: mandate.merchant_allowlist || null,
    valid_from: mandate.valid_from,
    valid_until: mandate.valid_until,
    signature: mandate.signature,
    raw_mandate: { ...mandate },
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  store.setMandateConfig(mandate.mandate_id, config);

  logDecision({
    event: 'MANDATE_REGISTERED',
    mandate_id: mandate.mandate_id,
    result: 'OK',
    details: { version: config.version, cumulative_cap: config.cumulative_cap, period_type: config.period_type }
  });

  return config;
}

export const initializeMandate = registerMandate;

// ── Bucket helpers ────────────────────────────────────────────────────

function createBucket(mandateId, periodKey, bucketKey, nowMs) {
  return {
    bucket_key: bucketKey,
    mandate_id: mandateId,
    period_key: periodKey,
    cumulative_spend: 0,
    pending_spend: 0,
    pending_reservations: [],
    transaction_count: 0,
    category_histogram: {},
    seen_nonces: [],
    last_transaction_at: null,
    created_at: new Date(nowMs).toISOString(),
    updated_at: new Date(nowMs).toISOString()
  };
}

function sweepExpiredReservations(bucket, nowMs) {
  const expired = [];
  const kept = [];

  for (const r of bucket.pending_reservations) {
    if (nowMs >= r.expires_at) {
      expired.push(r);
      bucket.pending_spend -= r.amount_paise;
    } else {
      kept.push(r);
    }
  }

  bucket.pending_reservations = kept;
  return expired;
}

// ── Core atomic operations ────────────────────────────────────────────

export async function attemptAtomicSpend({
  mandate_id,
  amount_paise,
  category,
  merchant,
  nonce,
  session_id,
  _testNowMs
}) {
  const config = store.mandateConfigs.get(mandate_id);
  if (!config) {
    return { success: false, reason: 'MANDATE_NOT_FOUND', details: `No config for ${mandate_id}` };
  }

  const nowMs = _testNowMs ?? Date.now();
  const requestValidationError = validateSpendRequest(config, amount_paise, nowMs);
  if (requestValidationError) return requestValidationError;
  const periodKey = computePeriodKey(config.period_type, nowMs);
  const bucketKey = computeBucketKey(mandate_id, periodKey);

  if (isMongoConnected()) {
    let bucket = store.buckets.get(bucketKey);
    if (!bucket) {
      bucket = createBucket(mandate_id, periodKey, bucketKey, nowMs);
      store.setBucket(bucketKey, bucket);
    }

    const expired = sweepExpiredReservations(bucket, nowMs);
    for (const r of expired) {
      logDecision({
        event: 'RESERVATION_EXPIRED',
        mandate_id, bucket_key: bucketKey, session_id: r.session_id,
        result: 'AUTO_DENIED',
        details: `Pending reservation of ${r.amount_paise} paise expired (fail-closed)`,
        timestamp: new Date(nowMs).toISOString()
      });
    }

    const mongoDoc = await atomicMongoBucketSpend({
      bucket_key: bucketKey,
      amount_paise,
      cumulative_cap: config.cumulative_cap,
      velocity_limit: config.velocity_limit,
      nonce,
      category,
      nowMs,
      initialBucket: bucket
    });

    if (mongoDoc) {
      delete mongoDoc._id;
      delete mongoDoc._updatedAt;
      store.buckets.set(bucketKey, mongoDoc);

      logDecision({
        event: 'SPEND_COMMITTED', mandate_id, bucket_key: bucketKey,
        session_id, result: 'OK',
        details: {
          amount_paise,
          new_cumulative_spend: mongoDoc.cumulative_spend,
          pending_spend: mongoDoc.pending_spend,
          remaining: config.cumulative_cap - mongoDoc.cumulative_spend - mongoDoc.pending_spend,
          enforcement: 'MONGODB_ATOMIC_FIND_ONE_AND_UPDATE'
        },
        timestamp: new Date(nowMs).toISOString()
      });

      return {
        success: true,
        mandate_id,
        bucket_key: bucketKey,
        amount_paise,
        new_cumulative_spend: mongoDoc.cumulative_spend,
        new_pending_spend: mongoDoc.pending_spend,
        remaining_cap: config.cumulative_cap - mongoDoc.cumulative_spend - mongoDoc.pending_spend,
        state_snapshot: getStateSnapshot(mandate_id, nowMs)
      };
    } else {
      const db = getDb();
      const currentDbDoc = db ? await db.collection('buckets').findOne({ bucket_key: bucketKey }) : bucket;
      const effectiveBucket = currentDbDoc || bucket;
      const isReplay = nonce && effectiveBucket.seen_nonces?.includes(nonce);

      if (isReplay) {
        logDecision({
          event: 'SPEND_ATTEMPT', mandate_id, bucket_key: bucketKey,
          session_id, result: 'REPLAY_NONCE_DETECTED',
          details: `Nonce ${nonce} already consumed (MongoDB-enforced)`,
          timestamp: new Date(nowMs).toISOString()
        });
        return {
          success: false,
          reason: 'REPLAY_NONCE_DETECTED',
          details: `Nonce ${nonce} already consumed`
        };
      }

      if ((effectiveBucket.transaction_count || 0) + 1 > config.velocity_limit) {
        return {
          success: false,
          reason: 'VELOCITY_LIMIT_EXCEEDED',
          details: `Count ${(effectiveBucket.transaction_count || 0) + 1} exceeds velocity limit ${config.velocity_limit}`
        };
      }

      const effectiveSpend = (effectiveBucket.cumulative_spend || 0) + (effectiveBucket.pending_spend || 0) + amount_paise;
      logDecision({
        event: 'SPEND_ATTEMPT', mandate_id, bucket_key: bucketKey,
        session_id, result: 'CUMULATIVE_CAP_EXCEEDED',
        details: `${effectiveBucket.cumulative_spend || 0} confirmed + ${effectiveBucket.pending_spend || 0} pending + ${amount_paise} requested = ${effectiveSpend} > ${config.cumulative_cap} cap (MongoDB-enforced)`,
        timestamp: new Date(nowMs).toISOString()
      });

      return {
        success: false,
        reason: 'CUMULATIVE_CAP_EXCEEDED',
        details: `Effective spend ${effectiveSpend} paise exceeds cap of ${config.cumulative_cap} paise`,
        current_cumulative_spend: effectiveBucket.cumulative_spend || 0,
        current_pending_spend: effectiveBucket.pending_spend || 0,
        remaining_cap: Math.max(0, config.cumulative_cap - (effectiveBucket.cumulative_spend || 0) - (effectiveBucket.pending_spend || 0)),
        requested_amount: amount_paise
      };
    }
  }

  return await store.runAtomic(bucketKey, () => {
    let bucket = store.buckets.get(bucketKey);
    if (!bucket) {
      bucket = createBucket(mandate_id, periodKey, bucketKey, nowMs);
      store.setBucket(bucketKey, bucket);
    }

    const expired = sweepExpiredReservations(bucket, nowMs);
    for (const r of expired) {
      logDecision({
        event: 'RESERVATION_EXPIRED',
        mandate_id, bucket_key: bucketKey, session_id: r.session_id,
        result: 'AUTO_DENIED',
        details: `Pending reservation of ${r.amount_paise} paise expired (fail-closed)`,
        timestamp: new Date(nowMs).toISOString()
      });
    }

    if (nonce) {
      if (bucket.seen_nonces.includes(nonce)) {
        logDecision({
          event: 'SPEND_ATTEMPT', mandate_id, bucket_key: bucketKey,
          session_id, result: 'REPLAY_NONCE_DETECTED',
          details: `Nonce ${nonce} already consumed`,
          timestamp: new Date(nowMs).toISOString()
        });
        return {
          success: false,
          reason: 'REPLAY_NONCE_DETECTED',
          details: `Nonce ${nonce} already consumed`
        };
      }
    }

    const effectiveTotal = bucket.cumulative_spend + bucket.pending_spend + amount_paise;
    if (effectiveTotal > config.cumulative_cap) {
      logDecision({
        event: 'SPEND_ATTEMPT', mandate_id, bucket_key: bucketKey,
        session_id, result: 'CUMULATIVE_CAP_EXCEEDED',
        details: `${bucket.cumulative_spend} confirmed + ${bucket.pending_spend} pending + ${amount_paise} requested = ${effectiveTotal} > ${config.cumulative_cap} cap`,
        timestamp: new Date(nowMs).toISOString()
      });
      return {
        success: false,
        reason: 'CUMULATIVE_CAP_EXCEEDED',
        details: `Effective spend ${effectiveTotal} paise exceeds cap of ${config.cumulative_cap} paise`,
        current_cumulative_spend: bucket.cumulative_spend,
        current_pending_spend: bucket.pending_spend,
        remaining_cap: config.cumulative_cap - bucket.cumulative_spend - bucket.pending_spend,
        requested_amount: amount_paise
      };
    }

    if (bucket.transaction_count + 1 > config.velocity_limit) {
      logDecision({
        event: 'SPEND_ATTEMPT', mandate_id, bucket_key: bucketKey,
        session_id, result: 'VELOCITY_LIMIT_EXCEEDED',
        timestamp: new Date(nowMs).toISOString()
      });
      return {
        success: false,
        reason: 'VELOCITY_LIMIT_EXCEEDED',
        details: `Count ${bucket.transaction_count + 1} exceeds velocity limit ${config.velocity_limit}`
      };
    }

    bucket.cumulative_spend += amount_paise;
    bucket.transaction_count += 1;
    bucket.last_transaction_at = new Date(nowMs).toISOString();
    if (category) {
      bucket.category_histogram[category] = (bucket.category_histogram[category] || 0) + 1;
    }
    if (nonce) {
      bucket.seen_nonces.push(nonce);
      if (bucket.seen_nonces.length > 1000) bucket.seen_nonces.shift();
    }
    bucket.updated_at = new Date(nowMs).toISOString();
    store.setBucket(bucketKey, bucket);

    logDecision({
      event: 'SPEND_COMMITTED', mandate_id, bucket_key: bucketKey,
      session_id, result: 'OK',
      details: {
        amount_paise,
        new_cumulative_spend: bucket.cumulative_spend,
        pending_spend: bucket.pending_spend,
        remaining: config.cumulative_cap - bucket.cumulative_spend - bucket.pending_spend
      },
      timestamp: new Date(nowMs).toISOString()
    });

    return {
      success: true,
      bucket_key: bucketKey,
      period_key: periodKey,
      new_cumulative_spend: bucket.cumulative_spend,
      pending_spend: bucket.pending_spend,
      remaining_cap: config.cumulative_cap - bucket.cumulative_spend - bucket.pending_spend,
      transaction_count: bucket.transaction_count
    };
  });
}

export async function reservePendingSpend({
  mandate_id,
  amount_paise,
  session_id,
  ttl_ms,
  _testNowMs
}) {
  const config = store.mandateConfigs.get(mandate_id);
  if (!config) {
    return { success: false, reason: 'MANDATE_NOT_FOUND' };
  }

  const nowMs = _testNowMs ?? Date.now();
  const requestValidationError = validateSpendRequest(config, amount_paise, nowMs);
  if (requestValidationError) return requestValidationError;
  const periodKey = computePeriodKey(config.period_type, nowMs);
  const bucketKey = computeBucketKey(mandate_id, periodKey);
  const effectiveTtl = ttl_ms ?? DEFAULT_RESERVATION_TTL_MS;

  return await store.runAtomic(bucketKey, () => {
    let bucket = store.buckets.get(bucketKey);
    if (!bucket) {
      bucket = createBucket(mandate_id, periodKey, bucketKey, nowMs);
      store.setBucket(bucketKey, bucket);
    }

    sweepExpiredReservations(bucket, nowMs);

    const effectiveTotal = bucket.cumulative_spend + bucket.pending_spend + amount_paise;
    if (effectiveTotal > config.cumulative_cap) {
      logDecision({
        event: 'RESERVATION_ATTEMPT', mandate_id, bucket_key: bucketKey,
        session_id, result: 'CUMULATIVE_CAP_EXCEEDED',
        details: `${bucket.cumulative_spend} + ${bucket.pending_spend} + ${amount_paise} = ${effectiveTotal} > ${config.cumulative_cap}`,
        timestamp: new Date(nowMs).toISOString()
      });
      return {
        success: false,
        reason: 'CUMULATIVE_CAP_EXCEEDED',
        details: `Reservation would exceed cap`
      };
    }

    const expiresAt = nowMs + effectiveTtl;
    bucket.pending_spend += amount_paise;
    bucket.pending_reservations.push({
      session_id,
      amount_paise,
      reserved_at: nowMs,
      expires_at: expiresAt
    });
    bucket.updated_at = new Date(nowMs).toISOString();
    store.setBucket(bucketKey, bucket);

    logDecision({
      event: 'RESERVATION_CREATED', mandate_id, bucket_key: bucketKey,
      session_id, result: 'OK',
      details: {
        amount_paise,
        expires_at: new Date(expiresAt).toISOString(),
        pending_spend: bucket.pending_spend
      },
      timestamp: new Date(nowMs).toISOString()
    });

    return {
      success: true,
      bucket_key: bucketKey,
      period_key: periodKey,
      pending_spend: bucket.pending_spend,
      remaining_cap: config.cumulative_cap - bucket.cumulative_spend - bucket.pending_spend,
      expires_at: new Date(expiresAt).toISOString()
    };
  });
}

export async function commitReservation(bucketKey, sessionId) {
  return await store.runAtomic(bucketKey, () => {
    const bucket = store.buckets.get(bucketKey);
    if (!bucket) return { success: false, reason: 'BUCKET_NOT_FOUND' };

    const idx = bucket.pending_reservations.findIndex(r => r.session_id === sessionId);
    if (idx === -1) return { success: false, reason: 'RESERVATION_NOT_FOUND' };

    const reservation = bucket.pending_reservations[idx];

    bucket.pending_spend -= reservation.amount_paise;
    bucket.cumulative_spend += reservation.amount_paise;
    bucket.transaction_count += 1;
    bucket.pending_reservations.splice(idx, 1);
    bucket.updated_at = new Date().toISOString();
    store.setBucket(bucketKey, bucket);

    logDecision({
      event: 'RESERVATION_COMMITTED', mandate_id: bucket.mandate_id,
      bucket_key: bucketKey, session_id: sessionId, result: 'OK',
      details: {
        amount_paise: reservation.amount_paise,
        new_cumulative_spend: bucket.cumulative_spend,
        new_pending_spend: bucket.pending_spend
      }
    });

    return {
      success: true,
      cumulative_spend: bucket.cumulative_spend,
      pending_spend: bucket.pending_spend
    };
  });
}

export async function releaseReservation(bucketKey, sessionId) {
  return await store.runAtomic(bucketKey, () => {
    const bucket = store.buckets.get(bucketKey);
    if (!bucket) return { success: false, reason: 'BUCKET_NOT_FOUND' };

    const idx = bucket.pending_reservations.findIndex(r => r.session_id === sessionId);
    if (idx === -1) return { success: false, reason: 'RESERVATION_NOT_FOUND' };

    const reservation = bucket.pending_reservations[idx];
    bucket.pending_spend -= reservation.amount_paise;
    bucket.pending_reservations.splice(idx, 1);
    bucket.updated_at = new Date().toISOString();
    store.setBucket(bucketKey, bucket);

    logDecision({
      event: 'RESERVATION_RELEASED', mandate_id: bucket.mandate_id,
      bucket_key: bucketKey, session_id: sessionId, result: 'DENIED',
      details: { released_amount: reservation.amount_paise }
    });

    return {
      success: true,
      cumulative_spend: bucket.cumulative_spend,
      pending_spend: bucket.pending_spend,
      released_amount: reservation.amount_paise
    };
  });
}

export function getStateSnapshot(mandateId, _testNowMs) {
  const config = store.mandateConfigs.get(mandateId);
  if (!config) return null;

  const nowMs = _testNowMs ?? Date.now();
  const periodKey = computePeriodKey(config.period_type, nowMs);
  const bucketKey = computeBucketKey(mandateId, periodKey);
  const bucket = store.buckets.get(bucketKey);

  return {
    mandate_id: mandateId,
    principal_id: config.principal_id,
    agent_id: config.agent_id,
    period_key: periodKey,
    bucket_key: bucketKey,
    cumulative_spend: bucket?.cumulative_spend ?? 0,
    pending_spend: bucket?.pending_spend ?? 0,
    cumulative_cap: config.cumulative_cap,
    remaining_cap: config.cumulative_cap - (bucket?.cumulative_spend ?? 0) - (bucket?.pending_spend ?? 0),
    transaction_count: bucket?.transaction_count ?? 0,
    velocity_limit: config.velocity_limit,
    category_histogram: bucket?.category_histogram ? { ...bucket.category_histogram } : {},
    status: config.status
  };
}

export function getBucket(bucketKey) {
  return store.buckets.get(bucketKey) ?? null;
}
