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

// Log every request so we can see what's actually hitting the server
app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  next();
});

// Webhook signatures cover the original bytes, so this route must be parsed
// before the JSON middleware transforms its body.
app.post('/api/v1/webhooks/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const result = await handleRazorpayWebhook({
      rawBody: req.body,
      signature: req.headers['x-razorpay-signature'],
      eventId: req.headers['x-razorpay-event-id'],
      secret: process.env.RAZORPAY_WEBHOOK_SECRET
    });
    return res.status(result.status).json(result);
  } catch (err) {
    console.error('[Webhook Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

app.use(express.json());

// Initialize MongoDB and load persistent state
connectMongo().then(() => {
  loadMongoIntoStore(store);
}).catch(err => {
  console.error('[MongoDB Connection Error]', err);
});

// Background sweep for stale in-flight idempotency claims
startSweepInterval();

// Routes
app.use('/api/v1/authorize', authorizeRouter);
app.use('/api/v1/mandates', mandatesRouter);
app.use('/api/v1/buyer', buyerRouter);
app.use('/api/v1/audit', auditRouter);
app.use('/api/v1/evaluation', evaluationRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'mandate-mirror-core',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

// Catch-all for unmatched routes (so 404s are visible instead of silent)
app.use((req, res) => {
  console.warn(`[404] No route matched: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

// Global error handler - catches anything thrown/rejected in route handlers
// that wasn't already caught, so the process doesn't crash silently
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[Mandate Mirror Core] Listening on port ${PORT}`);
  });
}

export default app;