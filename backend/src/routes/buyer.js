// backend/src/routes/buyer.js
import express from 'express';
import { runBuyerAgent } from '../agent/buyerAgent.js';
import { logDecision } from '../core/auditLog.js';
import { store } from '../db/store.js';

const router = express.Router();

/**
 * Buyer Agent Autonomous Shopping Endpoint (M3a)
 * POST /api/v1/buyer/shop
 * Body: { goal, mandate_id, agent_id }
 */
router.post('/shop', async (req, res) => {
  try {
    const { goal, mandate_id, agent_id } = req.body;

    if (!goal || !goal.trim()) {
      return res.status(400).json({ error: 'MISSING_GOAL', message: 'Shopping goal text is required' });
    }

    if (!mandate_id) {
      return res.status(400).json({ error: 'MISSING_MANDATE', message: 'mandate_id is required' });
    }

    // Retrieve active mandate configuration
    const mandateConfig = store.mandateConfigs.get(mandate_id);
    if (!mandateConfig) {
      return res.status(404).json({
        error: 'MANDATE_NOT_FOUND',
        message: `No active mandate configuration found for ID ${mandate_id}. Please issue and confirm a mandate first.`
      });
    }

    const mandate = mandateConfig.raw_mandate || mandateConfig;

    logDecision({
      event: 'BUYER_SHOP_TRIGGERED',
      mandate_id,
      agent_id: agent_id || mandate.agent_id,
      result: 'DISPATCHED',
      details: { goal }
    });

    const targetUrl = `http://127.0.0.1:${process.env.PORT || 5000}/api/v1/authorize`;

    const result = await runBuyerAgent({
      goal,
      mandate,
      agent_id: agent_id || mandate.agent_id,
      targetUrl
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'BUYER_EXECUTION_FAILED', message: err.message });
  }
});

export default router;
