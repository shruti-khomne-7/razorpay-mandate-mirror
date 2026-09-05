// backend/tests/concurrency.test.js
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../src/db/store.js';
import {
  registerMandate,
  attemptAtomicSpend,
  reservePendingSpend,
  commitReservation,
  releaseReservation,
  getStateSnapshot,
  getBucket,
  computePeriodKey,
  computeBucketKey,
  windowToPeriodType
} from '../src/core/stateMachine.js';
import {
  claimRequest,
  completeRequest,
  releaseRequest
} from '../src/core/idempotency.js';
import { signMandate } from '../src/core/mandateSigner.js';

function registerTestMandate(mandate) {
  return registerMandate(signMandate({
    allowed_categories: ['grocery'],
    // Fixed range keeps explicit-time bucket tests valid independently of today.
    valid_from: '2020-01-01T00:00:00.000Z',
    valid_until: '2030-01-01T00:00:00.000Z',
    ...mandate
  }));
}

describe('M1 — Bucketed Atomic State Machine', () => {
  beforeEach(() => {
    store.clear();
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 1: 20 concurrent requests competing for ₹150 remaining
  // ────────────────────────────────────────────────────────────────────
  test('Race: 20 concurrent requests for ₹150 slot in ₹5,000 cap — exactly 1 succeeds', async () => {
    const mandateId = 'mandate_race_001';

    registerTestMandate({
      mandate_id: mandateId,
      principal_id: 'alice',
      agent_id: 'grocery_bot',
      spend_cap_per_txn: 500000,   // high per-txn so it's not the binding constraint
      cumulative_cap: 500000,       // ₹5,000
      cumulative_window: 'P1M',
      velocity_limit: 50
    });

    // Pre-spend ₹4,850 (485,000 paise), leaving exactly ₹150
    const setup = await attemptAtomicSpend({
      mandate_id: mandateId,
      amount_paise: 485000,
      nonce: 'setup_nonce'
    });
    assert.equal(setup.success, true, `Setup spend failed: ${setup.reason}`);
    assert.equal(setup.new_cumulative_spend, 485000);
    assert.equal(setup.remaining_cap, 15000); // ₹150 left

    // Fire 20 concurrent requests for ₹150 each
    const promises = Array.from({ length: 20 }, (_, i) =>
      attemptAtomicSpend({
        mandate_id: mandateId,
        amount_paise: 15000,
        category: 'grocery',
        nonce: `race_${i}`
      })
    );
    const results = await Promise.all(promises);

    const won = results.filter(r => r.success === true);
    const lost = results.filter(r => r.success === false && r.reason === 'CUMULATIVE_CAP_EXCEEDED');

    assert.equal(won.length, 1, `Expected exactly 1 winner, got ${won.length}`);
    assert.equal(lost.length, 19, `Expected 19 cap rejections, got ${lost.length}`);

    // Verify the bucket document directly
    const bucketKey = won[0].bucket_key;
    const bucket = getBucket(bucketKey);
    assert.equal(bucket.cumulative_spend, 500000, 'Final cumulative_spend must be exactly 500000');
    assert.equal(bucket.pending_spend, 0, 'No pending spend in this test');
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 2: Nonce replay — 10 concurrent requests, same nonce
  // ────────────────────────────────────────────────────────────────────
  test('Nonce replay: 10 concurrent requests with duplicate nonce — exactly 1 succeeds', async () => {
    const mandateId = 'mandate_nonce_001';

    registerTestMandate({
      mandate_id: mandateId,
      principal_id: 'bob',
      agent_id: 'procurement_bot',
      spend_cap_per_txn: 50000,
      cumulative_cap: 1000000,
      cumulative_window: 'P1M',
      velocity_limit: 100
    });

    const sharedNonce = 'dup_nonce_99';
    const promises = Array.from({ length: 10 }, () =>
      attemptAtomicSpend({
        mandate_id: mandateId,
        amount_paise: 1000,
        nonce: sharedNonce
      })
    );
    const results = await Promise.all(promises);

    const won = results.filter(r => r.success === true);
    const replayed = results.filter(r => r.reason === 'REPLAY_NONCE_DETECTED');

    assert.equal(won.length, 1, `Expected 1 winner, got ${won.length}`);
    assert.equal(replayed.length, 9, `Expected 9 replay rejections, got ${replayed.length}`);
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 3: Cross-period bucketing — new period starts at zero
  // ────────────────────────────────────────────────────────────────────
  test('Period bucketing: September bucket is full, October bucket starts at zero', async () => {
    const mandateId = 'mandate_period_001';

    registerTestMandate({
      mandate_id: mandateId,
      principal_id: 'carol',
      agent_id: 'monthly_bot',
      spend_cap_per_txn: 25000,
      cumulative_cap: 20000,       // ₹200 cap per month
      cumulative_window: 'P1M',
      velocity_limit: 10
    });

    // September 15, 2026
    const septMs = new Date('2026-09-15T12:00:00Z').getTime();
    // October 15, 2026
    const octMs = new Date('2026-10-15T12:00:00Z').getTime();

    // Spend ₹200 in September — fills it up
    const s1 = await attemptAtomicSpend({
      mandate_id: mandateId, amount_paise: 20000, nonce: 'sept_1', _testNowMs: septMs
    });
    assert.equal(s1.success, true);
    assert.equal(s1.period_key, '2026-09');
    assert.equal(s1.remaining_cap, 0);

    // Another ₹50 in September — must fail
    const s2 = await attemptAtomicSpend({
      mandate_id: mandateId, amount_paise: 5000, nonce: 'sept_2', _testNowMs: septMs + 1000
    });
    assert.equal(s2.success, false);
    assert.equal(s2.reason, 'CUMULATIVE_CAP_EXCEEDED');

    // ₹50 in October — must succeed (new bucket, zero starting balance)
    const s3 = await attemptAtomicSpend({
      mandate_id: mandateId, amount_paise: 5000, nonce: 'oct_1', _testNowMs: octMs
    });
    assert.equal(s3.success, true, `October spend should succeed: ${s3.reason}`);
    assert.equal(s3.period_key, '2026-10');
    assert.equal(s3.new_cumulative_spend, 5000);
    assert.equal(s3.remaining_cap, 15000);

    // Verify both bucket documents exist independently
    const septBucket = getBucket(computeBucketKey(mandateId, '2026-09'));
    const octBucket = getBucket(computeBucketKey(mandateId, '2026-10'));
    assert.equal(septBucket.cumulative_spend, 20000, 'Sept bucket still at cap');
    assert.equal(octBucket.cumulative_spend, 5000, 'Oct bucket at 5000');
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 4: Pending-spend reservation blocks concurrent spends
  // ────────────────────────────────────────────────────────────────────
  test('Pending-spend: reservation blocks concurrent spends until committed', async () => {
    const mandateId = 'mandate_pending_001';

    registerTestMandate({
      mandate_id: mandateId,
      principal_id: 'dave',
      agent_id: 'pending_bot',
      spend_cap_per_txn: 50000,
      cumulative_cap: 40000,       // ₹400 cap
      cumulative_window: 'P1M',
      velocity_limit: 20
    });

    const nowMs = Date.now();

    // 1. Spend ₹200 confirmed
    const s1 = await attemptAtomicSpend({
      mandate_id: mandateId, amount_paise: 20000, nonce: 'p1', _testNowMs: nowMs
    });
    assert.equal(s1.success, true);
    assert.equal(s1.new_cumulative_spend, 20000);

    // 2. Reserve ₹150 (pending) — should fit: 20000 + 0 + 15000 = 35000 <= 40000
    const r1 = await reservePendingSpend({
      mandate_id: mandateId, amount_paise: 15000, session_id: 'esc_001',
      ttl_ms: 600_000, _testNowMs: nowMs
    });
    assert.equal(r1.success, true);
    assert.equal(r1.pending_spend, 15000);

    // 3. Try to spend ₹100 — must FAIL: 20000 + 15000 + 10000 = 45000 > 40000
    const s2 = await attemptAtomicSpend({
      mandate_id: mandateId, amount_paise: 10000, nonce: 'p2', _testNowMs: nowMs
    });
    assert.equal(s2.success, false);
    assert.equal(s2.reason, 'CUMULATIVE_CAP_EXCEEDED');

    // 4. Commit the reservation — moves ₹150 from pending to confirmed
    const bucketKey = r1.bucket_key;
    const c1 = await commitReservation(bucketKey, 'esc_001');
    assert.equal(c1.success, true);
    assert.equal(c1.cumulative_spend, 35000, 'Confirmed should now be 35000');
    assert.equal(c1.pending_spend, 0, 'Pending should be 0 after commit');

    // 5. Now ₹50 should fit: 35000 + 0 + 5000 = 40000 <= 40000
    const s3 = await attemptAtomicSpend({
      mandate_id: mandateId, amount_paise: 5000, nonce: 'p3', _testNowMs: nowMs
    });
    assert.equal(s3.success, true);
    assert.equal(s3.new_cumulative_spend, 40000);
    assert.equal(s3.remaining_cap, 0);
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 5: Pending-spend TTL expiry — fail-closed, never auto-approves
  // ────────────────────────────────────────────────────────────────────
  test('Pending TTL expiry: expired reservation auto-denies and frees capacity', async () => {
    const mandateId = 'mandate_ttl_001';

    registerTestMandate({
      mandate_id: mandateId,
      principal_id: 'eve',
      agent_id: 'ttl_bot',
      spend_cap_per_txn: 50000,
      cumulative_cap: 30000,       // ₹300 cap
      cumulative_window: 'P1M',
      velocity_limit: 20
    });

    const T = new Date('2026-09-02T10:00:00Z').getTime();

    // Spend ₹100 confirmed
    await attemptAtomicSpend({
      mandate_id: mandateId, amount_paise: 10000, nonce: 'ttl_1', _testNowMs: T
    });

    // Reserve ₹150 with ttl_ms = 1 (expires at T+1)
    const r1 = await reservePendingSpend({
      mandate_id: mandateId, amount_paise: 15000, session_id: 'ttl_esc_001',
      ttl_ms: 1, _testNowMs: T
    });
    assert.equal(r1.success, true);
    assert.equal(r1.pending_spend, 15000);

    // At T+100ms: reservation has expired.
    // Spend ₹150 — sweep should expire the reservation, freeing pending_spend.
    // Cap check: 10000 confirmed + 0 pending (after sweep) + 15000 = 25000 <= 30000 → OK
    const s2 = await attemptAtomicSpend({
      mandate_id: mandateId, amount_paise: 15000, nonce: 'ttl_2', _testNowMs: T + 100
    });
    assert.equal(s2.success, true, `Post-expiry spend should succeed: ${s2.reason}`);
    assert.equal(s2.new_cumulative_spend, 25000);
    assert.equal(s2.pending_spend, 0, 'Pending should be 0 after sweep');

    // Verify: cumulative_spend is 25000 (10000 original + 15000 new spend).
    // The expired reservation's 15000 did NOT get committed — it was auto-denied.
    const bucket = getBucket(s2.bucket_key);
    assert.equal(bucket.cumulative_spend, 25000);
    assert.equal(bucket.pending_spend, 0);
    assert.equal(bucket.pending_reservations.length, 0);
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 6: In-flight idempotency lifecycle
  // ────────────────────────────────────────────────────────────────────
  test('Idempotency: IN_FLIGHT blocks duplicate, COMPLETED replays cached result', async () => {
    const mandateId = 'm1';
    const requestId = 'req_42';

    // First claim succeeds
    const c1 = await claimRequest(mandateId, requestId);
    assert.equal(c1.claimed, true);

    // Second claim while still in-flight — blocked
    const c2 = await claimRequest(mandateId, requestId);
    assert.equal(c2.claimed, false);
    assert.equal(c2.existing.status, 'IN_FLIGHT');

    // Complete the request
    const cachedResult = { decision: 'CLEAR', amount: 45000 };
    await completeRequest(mandateId, requestId, cachedResult);

    // Third claim after completion — returns cached result
    const c3 = await claimRequest(mandateId, requestId);
    assert.equal(c3.claimed, false);
    assert.equal(c3.existing.status, 'COMPLETED');
    assert.deepEqual(c3.existing.result, cachedResult);
  });
});
