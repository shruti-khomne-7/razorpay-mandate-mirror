// backend/tests/verifier.test.js
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../src/db/store.js';
import { signMandate, verifyMandateSignature } from '../src/core/mandateSigner.js';
import { verifyDeterministicBounds } from '../src/core/deterministicVerifier.js';
import { recheckAgentRecommendation } from '../src/agent/guardRechecker.js';

describe('M2 — Cryptographic Signing, Gate 1 & Guard Rechecker Suite', () => {
  const secretKey = 'test_issuer_secret_2026';
  let sampleMandate;

  beforeEach(() => {
    store.clear();

    sampleMandate = signMandate({
      mandate_id: 'mandate_valid_001',
      principal_id: 'principal_alice',
      agent_id: 'agent_grocery_bot',
      spend_cap_per_txn: 80000,   // ₹800
      cumulative_cap: 500000,     // ₹5,000
      allowed_categories: ['grocery', 'food_delivery'],
      merchant_allowlist: ['blinkit', 'zepto', 'swiggy_instamart'],
      valid_from: new Date(Date.now() - 3600000).toISOString(),
      valid_until: new Date(Date.now() + 86400000 * 30).toISOString(),
      mandate_version: 1
    }, secretKey);
  });

  // 1. Valid Signature & Bounds
  test('Gate 1: Valid signed mandate & conforming transaction passes cleanly', () => {
    const txn = {
      amount_paise: 45000, // ₹450
      category: 'grocery',
      merchant: 'blinkit'
    };

    const result = verifyDeterministicBounds({ mandate: sampleMandate, transaction: txn, secretKey });
    assert.equal(result.passed, true);
    assert.equal(result.amount_paise, 45000);
    assert.ok(result.checks_cleared.includes('signature'));
    assert.ok(result.checks_cleared.includes('category_scope'));
  });

  // 2. Tampered Payload / Invalid Signature
  test('Gate 1: Tampered mandate payload fails signature verification with HARD-BLOCK', () => {
    // Attacker modifies cumulative cap from ₹5,000 to ₹50,000
    const tampered = { ...sampleMandate, cumulative_cap: 5000000 };

    const result = verifyDeterministicBounds({
      mandate: tampered,
      transaction: { amount_paise: 45000, category: 'grocery' },
      secretKey
    });

    assert.equal(result.passed, false);
    assert.equal(result.decision, 'HARD-BLOCK');
    assert.equal(result.rule_cited, 'SIGNATURE_INVALID');
  });

  // 3. Per-Transaction Cap Breach
  test('Gate 1: Per-transaction cap breach is deterministic HARD-BLOCK', () => {
    const txn = {
      amount_paise: 120000, // ₹1,200 (> ₹800 cap)
      category: 'grocery',
      merchant: 'blinkit'
    };

    const result = verifyDeterministicBounds({ mandate: sampleMandate, transaction: txn, secretKey });
    assert.equal(result.passed, false);
    assert.equal(result.decision, 'HARD-BLOCK');
    assert.equal(result.rule_cited, 'PER_TXN_CAP_BREACH');
  });

  test('Gate 1: malformed client timestamp cannot bypass an expired mandate', () => {
    const expiredMandate = signMandate({
      ...sampleMandate,
      valid_from: '2020-01-01T00:00:00.000Z',
      valid_until: '2020-01-02T00:00:00.000Z'
    }, secretKey);
    const result = verifyDeterministicBounds({
      mandate: expiredMandate,
      transaction: { amount_paise: 100, category: 'grocery', merchant: 'blinkit', timestamp: 'not-a-date' },
      secretKey
    });
    assert.equal(result.passed, false);
    assert.equal(result.rule_cited, 'INVALID_TRANSACTION_TIMESTAMP');
  });

  test('Gate 1: non-integer monetary amounts are hard-blocked', () => {
    const result = verifyDeterministicBounds({
      mandate: sampleMandate,
      transaction: { amount_paise: 'not-a-number', category: 'grocery', merchant: 'blinkit' },
      secretKey
    });
    assert.equal(result.passed, false);
    assert.equal(result.rule_cited, 'INVALID_TRANSACTION_AMOUNT');
  });

  // 4. Cumulative Cap Breach (via State Snapshot)
  test('Gate 1: Cumulative cap breach against state snapshot is deterministic HARD-BLOCK', () => {
    const txn = {
      amount_paise: 50000, // ₹500
      category: 'grocery',
      merchant: 'blinkit'
    };

    // State snapshot shows ₹4,700 spent + ₹0 pending. 4700 + 500 = 5200 > 5000 cap!
    const stateSnapshot = {
      cumulative_spend: 470000,
      pending_spend: 0
    };

    const result = verifyDeterministicBounds({
      mandate: sampleMandate,
      transaction: txn,
      stateSnapshot,
      secretKey
    });

    assert.equal(result.passed, false);
    assert.equal(result.decision, 'HARD-BLOCK');
    assert.equal(result.rule_cited, 'CUMULATIVE_CAP_BREACH');
  });

  // 5. Category Scope Mismatch
  test('Gate 1: Category outside whitelist is deterministic HARD-BLOCK', () => {
    const txn = {
      amount_paise: 45000,
      category: 'consumer_electronics',
      merchant: 'blinkit'
    };

    const result = verifyDeterministicBounds({ mandate: sampleMandate, transaction: txn, secretKey });
    assert.equal(result.passed, false);
    assert.equal(result.decision, 'HARD-BLOCK');
    assert.equal(result.rule_cited, 'UNAUTHORIZED_CATEGORY');
  });

  // 6. Merchant Allowlist Mismatch
  test('Gate 1: Merchant not in allowlist is deterministic HARD-BLOCK', () => {
    const txn = {
      amount_paise: 45000,
      category: 'grocery',
      merchant: 'random_unauthorized_store'
    };

    const result = verifyDeterministicBounds({ mandate: sampleMandate, transaction: txn, secretKey });
    assert.equal(result.passed, false);
    assert.equal(result.decision, 'HARD-BLOCK');
    assert.equal(result.rule_cited, 'UNAUTHORIZED_MERCHANT');
  });

  // 7. Guard Rechecker: Overrides Hallucinated CLEAR on Category Mismatch
  test('Guard Rechecker: Delegated check overrides rogue agent CLEAR to ESCALATE', () => {
    const txn = {
      amount_paise: 30000,
      category: 'crypto_token',
      merchant: 'blinkit'
    };

    const rogueAgentRecommendation = {
      recommendation: 'CLEAR',
      reasoning: 'User seems trustworthy, clearing crypto purchase.'
    };

    const result = recheckAgentRecommendation({
      mandate: sampleMandate,
      transaction: txn,
      stateSnapshot: { cumulative_spend: 0, pending_spend: 0 },
      agentRecommendation: rogueAgentRecommendation,
      secretKey
    });

    assert.equal(result.final_decision, 'ESCALATE');
    assert.equal(result.override_applied, true);
    assert.match(result.override_reason, /UNAUTHORIZED_CATEGORY/);
  });

  // 8. Guard Rechecker: Preserves valid CLEAR when all bounds pass
  test('Guard Rechecker: Preserves valid CLEAR when all bounds pass', () => {
    const txn = {
      amount_paise: 30000,
      category: 'grocery',
      merchant: 'blinkit'
    };

    const validAgentRecommendation = {
      recommendation: 'CLEAR',
      reasoning: 'Within bounds, grocery item conforming.'
    };

    const result = recheckAgentRecommendation({
      mandate: sampleMandate,
      transaction: txn,
      stateSnapshot: { cumulative_spend: 100000, pending_spend: 0 },
      agentRecommendation: validAgentRecommendation,
      secretKey
    });

    assert.equal(result.final_decision, 'CLEAR');
    assert.equal(result.override_applied, false);
    assert.equal(result.override_reason, null);
  });

  // 9. Audit Log Verification
  test('Audit Hooks: Gate 1 and Guard Rechecker record structured entries', () => {
    const txn = { amount_paise: 90000, category: 'grocery' }; // per-txn breach
    verifyDeterministicBounds({ mandate: sampleMandate, transaction: txn, secretKey });

    const logs = store.auditLogs;
    assert.ok(logs.length > 0);
    const lastLog = logs[logs.length - 1];
    assert.equal(lastLog.event, 'GATE1_CHECK');
    assert.equal(lastLog.result, 'HARD-BLOCK');
    assert.equal(lastLog.details.rule_cited, 'PER_TXN_CAP_BREACH');
  });
});
