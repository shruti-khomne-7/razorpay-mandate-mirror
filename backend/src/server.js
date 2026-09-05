// backend/src/server.js
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authorizeRouter from './routes/authorize.js';
import mandatesRouter from './routes/mandates.js';
import auditRouter from './routes/audit.js';
import evaluationRouter from './routes/evaluation.js';
import buyerRouter from './routes/buyer.js';
import { handleRazorpayWebhook } from './payments/webhookHandler.js';
import { startSweepInterval } from './core/idempotency.js';

import { connectMongo, loadMongoIntoStore } from './db/mongo.js';
import { store } from './db/store.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize MongoDB and load persistent state
connectMongo().then(() => {
  loadMongoIntoStore(store);
});

// Background sweep for stale in-flight idempotency claims
startSweepInterval();

// Routes
app.use('/api/v1/authorize', authorizeRouter);
app.use('/api/v1/mandates', mandatesRouter);
app.use('/api/v1/buyer', buyerRouter);
app.use('/api/v1/audit', auditRouter);
app.use('/api/v1/evaluation', evaluationRouter);

// Razorpay Webhook Ingestion Route
app.post('/api/v1/webhooks/razorpay', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const eventId = req.headers['x-razorpay-event-id'];
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  const result = await handleRazorpayWebhook({
    rawBody: req.body,
    signature,
    eventId,
    secret
  });

  return res.json(result);
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'mandate-mirror-core',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[Mandate Mirror Core] Listening on port ${PORT}`);
  });
}

export default app;
