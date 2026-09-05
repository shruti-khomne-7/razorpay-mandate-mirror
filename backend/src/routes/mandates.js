// backend/src/routes/mandates.js
import express from 'express';
import { signMandate } from '../core/mandateSigner.js';
import { registerMandate, getStateSnapshot } from '../core/stateMachine.js';
import { parseNaturalLanguageMandate } from '../core/mandateIssuance.js';
import { logDecision } from '../core/auditLog.js';
import { store } from '../db/store.js';
import { persistMandateConfig } from '../db/mongo.js';
import { requirePrincipalAuth } from '../middleware/principalAuth.js';

const router = express.Router();

// P0: every mandate operation is principal-authenticated and ownership-bound.
router.use(requirePrincipalAuth);

function requireOwnedMandate(mandateId, principalId) {
  const existing = store.mandateConfigs.get(mandateId);
  if (existing && existing.principal_id !== principalId) {
    const err = new Error('MANDATE_OWNERSHIP_VIOLATION');
    err.status = 403;
    throw err;
  }
  return existing;
}

function prepareServerMandate(rawMandate, principalId) {
  if (!rawMandate || !rawMandate.mandate_id || !rawMandate.agent_id) {
    const err = new Error('INVALID_PAYLOAD');
    err.status = 400;
    throw err;
  }

  const existing = requireOwnedMandate(rawMandate.mandate_id, principalId);
  // Version, signature, status, and timestamps are server-derived. Never sign
  // attacker-controlled copies of these fields.
  const {
    signature, mandate_version, status, created_at, updated_at, raw_mandate,
    period_type, principal_id, ...clientFields
  } = rawMandate;
  return {
    ...clientFields,
    mandate_id: rawMandate.mandate_id,
    principal_id: principalId,
    mandate_version: existing ? existing.version + 1 : 1
  };
}

/**
 * Natural Language Mandate Parsing (M3b)
 * POST /api/v1/mandates/parse
 * Body: { natural_text, principal_id }
 * Parses intent into structured mandate and generates warnings for any inferred field.
 * DOES NOT sign or register anything.
 */
router.post('/parse', async (req, res) => {
  try {
    const { natural_text } = req.body;
    if (!natural_text || !natural_text.trim()) {
      return res.status(400).json({ error: 'MISSING_TEXT', message: 'natural_text is required' });
    }

    const result = await parseNaturalLanguageMandate({ natural_text, principal_id: req.auth.principal_id });
    if (!result.success) {
      return res.status(422).json(result);
    }

    return res.json({
      structured_mandate: result.structured_mandate,
      warnings: result.warnings,
      parser_mode: result.parser_mode
    });
  } catch (err) {
    return res.status(500).json({ error: 'PARSE_FAILED', message: err.message });
  }
});

/**
 * Confirm and Sign Mandate (M3b)
 * POST /api/v1/mandates/confirm
 * Body: { structured_mandate, principal_id }
 * Explicit confirmation step: signs via mandateSigner.js and registers in stateMachine.
 * THIS IS THE ONLY ENDPOINT THAT ACTIVATES A LIVE MANDATE.
 */
router.post('/confirm', async (req, res) => {
  try {
    const { structured_mandate } = req.body;
    const serverMandate = prepareServerMandate(structured_mandate, req.auth.principal_id);

    // 1. Cryptographically sign the mandate
    const signedMandate = signMandate(serverMandate);

    // 2. Register into State Machine
    const registeredConfig = registerMandate(signedMandate);

    logDecision({
      event: 'MANDATE_CONFIRMED_AND_ACTIVATED',
      mandate_id: signedMandate.mandate_id,
      principal_id: signedMandate.principal_id,
      result: 'OK',
      details: {
        agent_id: signedMandate.agent_id,
        spend_cap_per_txn: signedMandate.spend_cap_per_txn,
        cumulative_cap: signedMandate.cumulative_cap,
        allowed_categories: signedMandate.allowed_categories
      }
    });

    return res.status(201).json({
      message: 'Mandate confirmed, cryptographically signed, and registered successfully.',
      mandate: signedMandate,
      config: registeredConfig
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message === 'INVALID_PAYLOAD' ? 'INVALID_PAYLOAD' : 'CONFIRMATION_FAILED', message: err.message });
  }
});

/**
 * Register / Issue raw mandate (Backwards-compatible API)
 * POST /api/v1/mandates
 */
router.post('/', async (req, res) => {
  try {
    const serverMandate = prepareServerMandate(req.body, req.auth.principal_id);
    const signedMandate = signMandate(serverMandate);
    const config = registerMandate(signedMandate);

    return res.status(201).json({
      message: 'Mandate registered and activated successfully',
      mandate: signedMandate,
      config
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message === 'INVALID_PAYLOAD' ? 'INVALID_PAYLOAD' : 'REGISTRATION_FAILED', message: err.message });
  }
});

/**
 * List all active mandates (Using store.mandateConfigs)
 * GET /api/v1/mandates
 */
router.get('/', (req, res) => {
  const configs = Array.from(store.mandateConfigs.values())
    .filter(config => config.principal_id === req.auth.principal_id)
    .map(({ signature, raw_mandate, ...config }) => config);
  return res.json({ mandates: configs });
});

/**
 * Get state snapshot of a specific mandate
 * GET /api/v1/mandates/:id
 */
router.get('/:id', async (req, res) => {
  const mandateId = req.params.id;
  try {
    requireOwnedMandate(mandateId, req.auth.principal_id);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
  const snapshot = getStateSnapshot(mandateId);
  if (!snapshot) {
    return res.status(404).json({ error: 'MANDATE_NOT_FOUND', message: `Mandate ${mandateId} does not exist.` });
  }
  return res.json({ mandate_id: mandateId, state: snapshot });
});

/**
 * Plain-Language and Structural Mandate Diff Endpoint
 * POST /api/v1/mandates/diff
 */
router.post('/diff', (req, res) => {
  const { old_mandate, new_mandate } = req.body;
  if (!old_mandate || !new_mandate) {
    return res.status(400).json({ error: 'MISSING_MANDATES', message: 'Both old_mandate and new_mandate are required for diff.' });
  }

  const changes = [];
  const plainTextDiffs = [];

  // 1. Spend Cap per Txn
  if (old_mandate.spend_cap_per_txn !== new_mandate.spend_cap_per_txn) {
    const oldVal = (old_mandate.spend_cap_per_txn / 100).toFixed(2);
    const newVal = (new_mandate.spend_cap_per_txn / 100).toFixed(2);
    changes.push({ field: 'spend_cap_per_txn', old: old_mandate.spend_cap_per_txn, new: new_mandate.spend_cap_per_txn });
    plainTextDiffs.push(`Per-transaction ceiling changed from ₹${oldVal} to ₹${newVal}.`);
  }

  // 2. Cumulative Cap
  if (old_mandate.cumulative_cap !== new_mandate.cumulative_cap) {
    const oldVal = (old_mandate.cumulative_cap / 100).toFixed(2);
    const newVal = (new_mandate.cumulative_cap / 100).toFixed(2);
    changes.push({ field: 'cumulative_cap', old: old_mandate.cumulative_cap, new: new_mandate.cumulative_cap });
    plainTextDiffs.push(`Monthly cumulative spending cap changed from ₹${oldVal} to ₹${newVal}.`);
  }

  // 3. Allowed Categories
  const oldCats = old_mandate.allowed_categories || [];
  const newCats = new_mandate.allowed_categories || [];
  const addedCats = newCats.filter(c => !oldCats.includes(c));
  const removedCats = oldCats.filter(c => !newCats.includes(c));

  if (addedCats.length > 0 || removedCats.length > 0) {
    changes.push({ field: 'allowed_categories', added: addedCats, removed: removedCats });
    if (addedCats.length > 0) plainTextDiffs.push(`Granted permission for new categories: [${addedCats.join(', ')}].`);
    if (removedCats.length > 0) plainTextDiffs.push(`Revoked permission for categories: [${removedCats.join(', ')}].`);
  }

  // 4. Merchant Allowlist
  const oldMerchants = old_mandate.merchant_allowlist || [];
  const newMerchants = new_mandate.merchant_allowlist || [];
  const addedMerchants = newMerchants.filter(m => !oldMerchants.includes(m));
  const removedMerchants = oldMerchants.filter(m => !newMerchants.includes(m));

  if (addedMerchants.length > 0 || removedMerchants.length > 0) {
    changes.push({ field: 'merchant_allowlist', added: addedMerchants, removed: removedMerchants });
    if (addedMerchants.length > 0) plainTextDiffs.push(`Added approved merchants: [${addedMerchants.join(', ')}].`);
    if (removedMerchants.length > 0) plainTextDiffs.push(`Removed merchants from allowlist: [${removedMerchants.join(', ')}].`);
  }

  return res.json({
    mandate_id: new_mandate.mandate_id,
    version_from: old_mandate.mandate_version,
    version_to: new_mandate.mandate_version,
    has_changes: changes.length > 0,
    changes,
    plain_language_summary: plainTextDiffs.length > 0
      ? plainTextDiffs.join(' ')
      : 'No scope changes detected between mandate versions.'
  });
});

/**
 * Revoke or Suspend Mandate
 * POST /api/v1/mandates/:id/status
 */
router.post('/:id/status', async (req, res) => {
  const mandateId = req.params.id;
  const { status } = req.body;

  if (!['SUSPENDED', 'REVOKED', 'ACTIVE'].includes(status)) {
    return res.status(400).json({ error: 'INVALID_STATUS', message: 'Status must be ACTIVE, SUSPENDED, or REVOKED' });
  }

  const config = store.mandateConfigs.get(mandateId);
  if (!config) {
    return res.status(404).json({ error: 'MANDATE_NOT_FOUND' });
  }
  if (config.principal_id !== req.auth.principal_id) {
    return res.status(403).json({ error: 'MANDATE_OWNERSHIP_VIOLATION' });
  }

  config.status = status;
  config.updated_at = new Date().toISOString();
  try {
    // P1: await durable persistence before reporting a status transition.
    await persistMandateConfig(config);
  } catch (err) {
    return res.status(503).json({ error: 'STATUS_PERSIST_FAILED', message: err.message });
  }

  logDecision({
    event: 'MANDATE_STATUS_UPDATED',
    mandate_id: mandateId,
    result: status,
    details: { new_status: status }
  });

  return res.json({ message: `Mandate status updated to ${status}`, config });
});

export default router;
