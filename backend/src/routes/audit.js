// backend/src/routes/audit.js
import express from 'express';
import { verifyAuditChain } from '../core/auditChain.js';
import { store } from '../db/store.js';

const router = express.Router();

/**
 * Get all Audit Trail entries
 * GET /api/v1/audit or GET /api/v1/audit/logs
 */
const getAuditLogs = (req, res) => {
  const logs = store.auditLogs || [];
  return res.json({
    total: logs.length,
    logs: [...logs].reverse() // latest first for feed display
  });
};

router.get('/', getAuditLogs);
router.get('/logs', getAuditLogs);

/**
 * Cryptographic SHA-256 Audit Chain Verification
 * GET /api/v1/audit/verify
 * Replays chain from Genesis to tip, verifying parent links & data integrity.
 */
router.get('/verify', (req, res) => {
  const verification = verifyAuditChain();
  return res.json(verification);
});

/**
 * Test-Only Tampering Demonstration Endpoint
 * POST /api/v1/audit/corrupt-demo
 * Gated strictly for non-production environments.
 * Mutates one past entry's details field in memory to demonstrate tamper detection.
 */
router.post('/corrupt-demo', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Tampering demo endpoint is strictly disabled in production.'
    });
  }

  const logs = store.auditLogs;
  if (!logs || logs.length === 0) {
    return res.status(400).json({
      error: 'EMPTY_LOGS',
      message: 'Cannot corrupt an empty audit chain. Trigger some system decisions first.'
    });
  }

  // Corrupt a record (use requested index or target the middle record)
  const targetIndex = typeof req.body.index === 'number' && req.body.index < logs.length
    ? req.body.index
    : Math.floor(logs.length / 2);

  const originalDetails = logs[targetIndex].details;
  logs[targetIndex].details = {
    ...logs[targetIndex].details,
    tampered_by_attacker: true,
    unauthorized_spend_override: 99999999
  };

  return res.json({
    success: true,
    message: `Corrupted in-memory audit entry at index ${targetIndex} for tampering proof demonstration.`,
    tampered_index: targetIndex,
    original_details: originalDetails,
    tampered_details: logs[targetIndex].details
  });
});

export default router;
