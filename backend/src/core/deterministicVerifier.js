// backend/src/core/deterministicVerifier.js
import { verifyMandateSignature } from './mandateSigner.js';
import { logDecision } from './auditLog.js';

/**
 * Gate 1: Deterministic Pre-Authorization Gate
 * Fast-fails any structurally flawed, expired, tampered, or statically out-of-bounds request.
 *
 * Parameters:
 *   mandate: Mandate configuration/signed payload
 *   transaction: Requested transaction object ({ amount_paise, category, merchant, timestamp, etc. })
 *   stateSnapshot: (Optional) Current bucket snapshot ({ cumulative_spend, pending_spend })
 *   secretKey: (Optional) Signing secret for verification
 *   session_id: (Optional) Tracing session ID
 *
 * Returns:
 *   { passed: true, amount_paise, checks_cleared }
 *   or
 *   { passed: false, decision: 'HARD-BLOCK', rule_cited, reason }
 */
export function verifyDeterministicBounds({
  mandate,
  transaction,
  stateSnapshot = null,
  secretKey = undefined,
  session_id = null
}) {
  // 1. Structural Schema Validation
  if (!mandate || typeof mandate !== 'object') {
    const failure = {
      passed: false,
      decision: 'HARD-BLOCK',
      rule_cited: 'SCHEMA_INVALID',
      reason: 'Mandate payload is missing or malformed'
    };
    logDecision({
      event: 'GATE1_CHECK',
      mandate_id: mandate?.mandate_id,
      session_id,
      result: 'HARD-BLOCK',
      details: failure
    });
    return failure;
  }

  const requiredFields = [
    'mandate_id',
    'principal_id',
    'agent_id',
    'spend_cap_per_txn',
    'cumulative_cap',
    'allowed_categories'
  ];

  for (const field of requiredFields) {
    if (mandate[field] === undefined || mandate[field] === null) {
      const failure = {
        passed: false,
        decision: 'HARD-BLOCK',
        rule_cited: 'MISSING_REQUIRED_FIELD',
        reason: `Mandate missing required field: ${field}`
      };
      logDecision({
        event: 'GATE1_CHECK',
        mandate_id: mandate.mandate_id,
        session_id,
        result: 'HARD-BLOCK',
        details: failure
      });
      return failure;
    }
  }

  // Monetary limits and velocity are security boundaries, never coercible UI values.
  const numericFields = ['spend_cap_per_txn', 'cumulative_cap'];
  for (const field of numericFields) {
    if (!Number.isSafeInteger(mandate[field]) || mandate[field] <= 0) {
      const failure = {
        passed: false,
        decision: 'HARD-BLOCK',
        rule_cited: 'INVALID_MANDATE_NUMERIC_FIELD',
        reason: `Mandate field ${field} must be a positive safe integer`
      };
      logDecision({ event: 'GATE1_CHECK', mandate_id: mandate.mandate_id, session_id, result: 'HARD-BLOCK', details: failure });
      return failure;
    }
  }
  if (mandate.velocity_limit !== undefined && (!Number.isSafeInteger(mandate.velocity_limit) || mandate.velocity_limit <= 0)) {
    const failure = {
      passed: false,
      decision: 'HARD-BLOCK',
      rule_cited: 'INVALID_MANDATE_NUMERIC_FIELD',
      reason: 'Mandate velocity_limit must be a positive safe integer'
    };
    logDecision({ event: 'GATE1_CHECK', mandate_id: mandate.mandate_id, session_id, result: 'HARD-BLOCK', details: failure });
    return failure;
  }

  // 2. Cryptographic Signature Verification
  if (mandate.signature) {
    const sigCheck = verifyMandateSignature(mandate, secretKey);
    if (!sigCheck.valid) {
      const failure = {
        passed: false,
        decision: 'HARD-BLOCK',
        rule_cited: 'SIGNATURE_INVALID',
        reason: `Cryptographic mandate signature verification failed (${sigCheck.reason})`
      };
      logDecision({
        event: 'GATE1_CHECK',
        mandate_id: mandate.mandate_id,
        session_id,
        result: 'HARD-BLOCK',
        details: failure
      });
      return failure;
    }
  } else {
    const failure = {
      passed: false,
      decision: 'HARD-BLOCK',
      rule_cited: 'MISSING_SIGNATURE',
      reason: 'Mandate must be cryptographically signed'
    };
    logDecision({
      event: 'GATE1_CHECK',
      mandate_id: mandate.mandate_id,
      session_id,
      result: 'HARD-BLOCK',
      details: failure
    });
    return failure;
  }

  // 3. Temporal Expiry Check
  // The server clock is authoritative. A client timestamp is trace metadata
  // only, but must still parse correctly when supplied.
  if (transaction?.timestamp !== undefined && !Number.isFinite(Date.parse(transaction.timestamp))) {
    const failure = {
      passed: false,
      decision: 'HARD-BLOCK',
      rule_cited: 'INVALID_TRANSACTION_TIMESTAMP',
      reason: 'transaction.timestamp must be a valid ISO-8601 date when supplied'
    };
    logDecision({ event: 'GATE1_CHECK', mandate_id: mandate.mandate_id, session_id, result: 'HARD-BLOCK', details: failure });
    return failure;
  }
  const now = Date.now();
  const validFrom = mandate.valid_from ? Date.parse(mandate.valid_from) : null;
  const validUntil = mandate.valid_until ? Date.parse(mandate.valid_until) : null;
  if ((mandate.valid_from && !Number.isFinite(validFrom)) || (mandate.valid_until && !Number.isFinite(validUntil)) ||
      (validFrom !== null && validUntil !== null && validUntil <= validFrom)) {
    const failure = {
      passed: false,
      decision: 'HARD-BLOCK',
      rule_cited: 'INVALID_MANDATE_VALIDITY_WINDOW',
      reason: 'Mandate validity dates must form a valid increasing interval'
    };
    logDecision({ event: 'GATE1_CHECK', mandate_id: mandate.mandate_id, session_id, result: 'HARD-BLOCK', details: failure });
    return failure;
  }
  if (validFrom !== null && now < validFrom) {
    const failure = {
      passed: false,
      decision: 'HARD-BLOCK',
      rule_cited: 'MANDATE_NOT_YET_VALID',
      reason: `Current time ${new Date(now).toISOString()} is prior to mandate valid_from ${mandate.valid_from}`
    };
    logDecision({
      event: 'GATE1_CHECK',
      mandate_id: mandate.mandate_id,
      session_id,
      result: 'HARD-BLOCK',
      details: failure
    });
    return failure;
  }

  if (validUntil !== null && now > validUntil) {
    const failure = {
      passed: false,
      decision: 'HARD-BLOCK',
      rule_cited: 'MANDATE_EXPIRED',
      reason: `Mandate expired at ${mandate.valid_until}`
    };
    logDecision({
      event: 'GATE1_CHECK',
      mandate_id: mandate.mandate_id,
      session_id,
      result: 'HARD-BLOCK',
      details: failure
    });
    return failure;
  }

  // 4. Per-Transaction Spending Ceiling Check
  if (transaction?.amount_paise === undefined || !Number.isSafeInteger(transaction.amount_paise) || transaction.amount_paise <= 0) {
    const failure = {
      passed: false,
      decision: 'HARD-BLOCK',
      rule_cited: 'INVALID_TRANSACTION_AMOUNT',
      reason: 'transaction.amount_paise must be a positive safe integer'
    };
    logDecision({
      event: 'GATE1_CHECK',
      mandate_id: mandate.mandate_id,
      session_id,
      result: 'HARD-BLOCK',
      details: failure
    });
    return failure;
  }
  const amountPaise = transaction.amount_paise;

  if (amountPaise > mandate.spend_cap_per_txn) {
    const failure = {
      passed: false,
      decision: 'HARD-BLOCK',
      rule_cited: 'PER_TXN_CAP_BREACH',
      reason: `Requested ${amountPaise} paise exceeds single transaction ceiling of ${mandate.spend_cap_per_txn} paise`
    };
    logDecision({
      event: 'GATE1_CHECK',
      mandate_id: mandate.mandate_id,
      session_id,
      result: 'HARD-BLOCK',
      details: failure
    });
    return failure;
  }

  // 5. Cumulative Cap Check against State Snapshot (if provided)
  if (stateSnapshot) {
    const currentSpend = stateSnapshot.cumulative_spend || 0;
    const pendingSpend = stateSnapshot.pending_spend || 0;
    const effectiveTotal = currentSpend + pendingSpend + amountPaise;

    if (effectiveTotal > mandate.cumulative_cap) {
      const failure = {
        passed: false,
        decision: 'HARD-BLOCK',
        rule_cited: 'CUMULATIVE_CAP_BREACH',
        reason: `Requested ${amountPaise} paise brings total spend (${effectiveTotal} paise) over cumulative cap of ${mandate.cumulative_cap} paise`
      };
      logDecision({
        event: 'GATE1_CHECK',
        mandate_id: mandate.mandate_id,
        session_id,
        result: 'HARD-BLOCK',
        details: failure
      });
      return failure;
    }
  }

  // 6. Category Scope Conformance Check
  if (Array.isArray(mandate.allowed_categories) && mandate.allowed_categories.length > 0) {
    const txnCategory = (transaction?.category || '').toLowerCase().trim();
    const isAllowed = mandate.allowed_categories.some(c => c.toLowerCase().trim() === txnCategory);
    if (!isAllowed) {
      const failure = {
        passed: false,
        decision: 'HARD-BLOCK',
        rule_cited: 'UNAUTHORIZED_CATEGORY',
        reason: `Item category "${transaction?.category}" is outside authorized categories: [${mandate.allowed_categories.join(', ')}]`
      };
      logDecision({
        event: 'GATE1_CHECK',
        mandate_id: mandate.mandate_id,
        session_id,
        result: 'HARD-BLOCK',
        details: failure
      });
      return failure;
    }
  }

  // 7. Merchant Allowlist Check
  if (Array.isArray(mandate.merchant_allowlist) && mandate.merchant_allowlist.length > 0) {
    const txnMerchant = (transaction?.merchant || transaction?.merchant_id || '').toLowerCase().trim();
    const isAllowedMerchant = mandate.merchant_allowlist.some(m => m.toLowerCase().trim() === txnMerchant);
    if (!isAllowedMerchant) {
      const failure = {
        passed: false,
        decision: 'HARD-BLOCK',
        rule_cited: 'UNAUTHORIZED_MERCHANT',
        reason: `Merchant "${transaction?.merchant}" is not in mandate allowlist: [${mandate.merchant_allowlist.join(', ')}]`
      };
      logDecision({
        event: 'GATE1_CHECK',
        mandate_id: mandate.mandate_id,
        session_id,
        result: 'HARD-BLOCK',
        details: failure
      });
      return failure;
    }
  }

  const success = {
    passed: true,
    amount_paise: amountPaise,
    checks_cleared: [
      'schema',
      'signature',
      'temporal_validity',
      'per_txn_cap',
      'cumulative_cap',
      'category_scope',
      'merchant_allowlist'
    ]
  };

  logDecision({
    event: 'GATE1_CHECK',
    mandate_id: mandate.mandate_id,
    session_id,
    result: 'PASS',
    details: { amount_paise: amountPaise, checks_cleared: success.checks_cleared }
  });

  return success;
}
