import express from 'express';
import { runFullBenchmarkSuite } from '../../../benchmarks/run_benchmark.js';
import { registerMandate, attemptAtomicSpend, getStateSnapshot } from '../core/stateMachine.js';
import { signMandate } from '../core/mandateSigner.js';
import { store } from '../db/store.js';

const router = express.Router();

router.post('/run-benchmarks', async (req, res) => {
  try {
    const results = await runFullBenchmarkSuite();
    return res.json(results);
  } catch (err) {
    return res.status(500).json({ error: 'BENCHMARK_EXECUTION_FAILED', message: err.message });
  }
});

router.post('/run-claim-a', async (req, res) => {
  try {
    const full = await runFullBenchmarkSuite();
    return res.json(full.claim_a_deterministic);
  } catch (err) {
    return res.status(500).json({ error: 'CLAIM_A_FAILED', message: err.message });
  }
});

router.post('/concurrency-race', async (req, res) => {
  try {
    const mandateId = `race_demo_${Date.now()}`;
    const cumulativeCap = 500000;
    const initialSpend = 480000;

    registerMandate(signMandate({
      mandate_id: mandateId,
      principal_id: 'race_principal_demo',
      agent_id: 'concurrency_bot',
      spend_cap_per_txn: 500000,
      cumulative_cap: cumulativeCap,
      cumulative_window: 'P1M',
      velocity_limit: 100,
      allowed_categories: ['grocery'],
      valid_from: '2020-01-01T00:00:00.000Z',
      valid_until: '2030-01-01T00:00:00.000Z'
    }));

    const seedResult = await attemptAtomicSpend({
      mandate_id: mandateId,
      amount_paise: initialSpend,
      category: 'grocery',
      nonce: `seed_nonce_${mandateId}`
    });
    if (!seedResult.success) {
      throw new Error(`Seed spend failed unexpectedly: ${seedResult.reason} — ${seedResult.details}`);
    }

    const requestCount = 20;
    const requestAmountPaise = 15000;

    const promises = Array.from({ length: requestCount }).map((_, idx) =>
      attemptAtomicSpend({
        mandate_id: mandateId,
        amount_paise: requestAmountPaise,
        category: 'grocery',
        nonce: `race_attack_thread_${idx}_${Date.now()}`
      }).then(result => ({
        thread_id: idx + 1,
        status: result.success ? 'WINNER_CLEAR' : 'REJECTED',
        reason: result.reason || 'SPEND_COMMITTED',
        requested_paise: requestAmountPaise,
        current_spend: result.new_cumulative_spend || result.current_cumulative_spend,
        remaining_cap: result.remaining_cap
      }))
    );

    const results = await Promise.all(promises);

    const winners = results.filter(r => r.status === 'WINNER_CLEAR');
    const rejected = results.filter(r => r.status === 'REJECTED');
    const snapshot = getStateSnapshot(mandateId);

    return res.json({
      mandate_id: mandateId,
      initial_remaining_cap_paise: cumulativeCap - initialSpend,
      requested_amount_per_thread_paise: requestAmountPaise,
      total_concurrent_requests: requestCount,
      winners_count: winners.length,
      rejected_count: rejected.length,
      final_cumulative_spend_paise: snapshot.cumulative_spend,
      final_remaining_cap_paise: snapshot.remaining_cap,
      cumulative_cap_paise: snapshot.cumulative_cap,
      thread_results: results,
      proof_passed: winners.length === 1 && rejected.length === 19 && snapshot.cumulative_spend === (initialSpend + requestAmountPaise)
    });
  } catch (err) {
    return res.status(500).json({ error: 'CONCURRENCY_RACE_FAILED', message: err.message });
  }
});

export default router;