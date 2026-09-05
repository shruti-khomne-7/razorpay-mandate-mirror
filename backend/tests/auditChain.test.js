// backend/tests/auditChain.test.js
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { recordAuditEntry, verifyAuditChain, GENESIS_HASH } from '../src/core/auditChain.js';
import { recheckAgentRecommendation } from '../src/agent/guardRechecker.js';
import { signMandate } from '../src/core/mandateSigner.js';
import { store } from '../src/db/store.js';

describe('Mandate Mirror — Hash-Chained Audit Trail & Safety Recheck Suite', () => {
  const secretKey = 'test_secret_audit_123';

  beforeEach(() => {
    store.clear();
  });

  test('Appended audit entries form a valid cryptographic SHA-256 hash chain', async () => {
    const e1 = await recordAuditEntry({
      session_id: 'sess_1',
      final_decision: 'CLEAR',
      reasoning: 'Within bounds',
      transaction: { amount_paise: 5000 }
    });
    assert.equal(e1.prev_entry_hash, GENESIS_HASH);

    const e2 = await recordAuditEntry({
      session_id: 'sess_2',
      final_decision: 'HARD-BLOCK',
      reasoning: 'Category mismatch',
      transaction: { amount_paise: 10000 }
    });
    assert.equal(e2.prev_entry_hash, e1.entry_hash);

    const e3 = await recordAuditEntry({
      session_id: 'sess_3',
      final_decision: 'STEP-UP',
      reasoning: 'High anomaly velocity',
      transaction: { amount_paise: 15000 }
    });
    assert.equal(e3.prev_entry_hash, e2.entry_hash);

    const verification = verifyAuditChain();
    assert.equal(verification.valid, true);
    assert.equal(verification.count, 3);
  });

  test('Tampering with past audit record breaks hash chain and pinpoints corruption index', async () => {
    await recordAuditEntry({ session_id: 'sess_1', final_decision: 'CLEAR', transaction: { amount_paise: 5000 } });
    await recordAuditEntry({ session_id: 'sess_2', final_decision: 'ESCALATE', transaction: { amount_paise: 15000 } });
    await recordAuditEntry({ session_id: 'sess_3', final_decision: 'CLEAR', transaction: { amount_paise: 2000 } });

    // Attacker modifies entry index 1 behind the scenes
    store.auditLogs[1].final_decision = 'CLEAR'; // changed from ESCALATE

    const verification = verifyAuditChain();
    assert.equal(verification.valid, false);
    assert.equal(verification.tampered_at_index, 1);
    assert.equal(verification.reason, 'HASH_MISMATCH_DATA_TAMPERED');
  });

  test('Guard Rechecker intercepts hallucinated or rogue agent CLEAR recommendation', () => {
    const signedMandate = signMandate({
      mandate_id: 'mandate_p1',
      principal_id: 'principal_alice',
      agent_id: 'agent_grocery_bot',
      cumulative_cap: 10000, // ₹100
      spend_cap_per_txn: 50000,
      allowed_categories: ['grocery'],
      valid_from: new Date(Date.now() - 3600000).toISOString(),
      valid_until: new Date(Date.now() + 86400000).toISOString(),
      mandate_version: 1
    }, secretKey);

    const transaction = {
      amount_paise: 6000, // ₹60
      category: 'grocery'
    };

    const stateSnapshot = {
      cumulative_spend: 7000, // Already spent ₹70, 70+60=130 > 100
      pending_spend: 0
    };

    // Rogue / hallucinated LLM recommendation
    const rogueAgentRecommendation = {
      recommendation: 'CLEAR',
      reasoning: 'Looks like a regular user buying groceries, clear it!'
    };

    const result = recheckAgentRecommendation({
      mandate: signedMandate,
      transaction,
      stateSnapshot,
      agentRecommendation: rogueAgentRecommendation,
      secretKey
    });

    assert.equal(result.final_decision, 'ESCALATE');
    assert.equal(result.override_applied, true);
    assert.match(result.override_reason, /CUMULATIVE_CAP_BREACH/);
  });
});
