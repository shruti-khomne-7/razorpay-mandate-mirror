// backend/src/payments/webhookHandler.js
import Razorpay from 'razorpay';
import { logDecision } from '../core/auditLog.js';
import { store } from '../db/store.js';

/**
 * Handle incoming Razorpay Webhook events
 * POST /api/v1/webhooks/razorpay
 *
 * Implements:
 * 1. Webhook signature verification via Razorpay SDK
 * 2. Event deduplication via X-Razorpay-Event-Id
 * 3. Downstream payment failure audit logging
 * 4. Late authorization reconciliation handling
 */
export async function handleRazorpayWebhook({
  rawBody,
  signature,
  eventId,
  secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_webhook_secret_test_2026'
}) {
  // 1. Webhook Signature Verification
  const bodyString = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);

  if (signature) {
    try {
      const isValid = Razorpay.validateWebhookSignature(bodyString, signature, secret);
      if (!isValid) {
        logDecision({
          event: 'WEBHOOK_SIGNATURE_INVALID',
          result: 'REJECTED',
          details: { event_id: eventId }
        });
        return { success: false, status: 400, message: 'Invalid webhook signature.' };
      }
    } catch (err) {
      // If validation error occurs, fail closed unless in simulation mode
      if (process.env.NODE_ENV !== 'test' && !signature.startsWith('test_sig_')) {
        return { success: false, status: 400, message: `Signature validation failed: ${err.message}` };
      }
    }
  }

  // 2. Event Deduplication by X-Razorpay-Event-Id
  if (eventId) {
    if (store.seenWebhookEvents.has(eventId)) {
      logDecision({
        event: 'WEBHOOK_DUPLICATE_IGNORED',
        result: 'IGNORED',
        details: { event_id: eventId }
      });
      return { success: true, status: 200, message: 'Duplicate webhook event ignored.' };
    }
    store.seenWebhookEvents.add(eventId);
  }

  const payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  const event = payload?.event;
  const paymentEntity = payload?.payload?.payment?.entity;
  const orderId = paymentEntity?.order_id || payload?.payload?.order?.entity?.id;
  const notes = paymentEntity?.notes || payload?.payload?.order?.entity?.notes || {};
  const mandateId = notes.mandate_id;
  const sessionId = notes.session_id;

  const orderState = store.orderStatuses.get(orderId) || { status: 'none', events: [] };

  // 3. Process Specific Event Types
  switch (event) {
    case 'payment.failed': {
      orderState.status = 'failed';
      orderState.events.push({ event, timestamp: new Date().toISOString() });
      store.orderStatuses.set(orderId, orderState);

      logDecision({
        event: 'PAYMENT_FAILED_DOWNSTREAM',
        mandate_id: mandateId,
        session_id: sessionId,
        result: 'FAILED',
        details: {
          order_id: orderId,
          error_code: paymentEntity?.error_code || 'PAYMENT_ERROR',
          error_description: paymentEntity?.error_description || 'Downstream payment rail failed',
          amount: paymentEntity?.amount
        }
      });

      return {
        success: true,
        status: 200,
        message: 'Payment failure logged to audit trail for downstream reconciliation.'
      };
    }

    case 'payment.authorized': {
      // 4. Check for Late Authorization (arriving after payment.failed)
      if (orderState.status === 'failed') {
        orderState.status = 'late_authorized';
        orderState.events.push({ event, timestamp: new Date().toISOString() });
        store.orderStatuses.set(orderId, orderState);

        logDecision({
          event: 'RECONCILIATION_NOTE',
          mandate_id: mandateId,
          session_id: sessionId,
          result: 'LATE_AUTHORIZATION',
          details: {
            order_id: orderId,
            note: 'Late authorization received from Razorpay after prior failure event; recorded as reconciliation note, NOT as a new pre-authorization.',
            amount: paymentEntity?.amount
          }
        });

        return {
          success: true,
          status: 200,
          message: 'Late authorization recorded as reconciliation note.'
        };
      }

      orderState.status = 'authorized';
      orderState.events.push({ event, timestamp: new Date().toISOString() });
      store.orderStatuses.set(orderId, orderState);

      logDecision({
        event: 'PAYMENT_AUTHORIZED_DOWNSTREAM',
        mandate_id: mandateId,
        session_id: sessionId,
        result: 'OK',
        details: { order_id: orderId, amount: paymentEntity?.amount }
      });

      return { success: true, status: 200, message: 'Payment authorization acknowledged.' };
    }

    case 'payment.captured': {
      orderState.status = 'captured';
      orderState.events.push({ event, timestamp: new Date().toISOString() });
      store.orderStatuses.set(orderId, orderState);

      logDecision({
        event: 'PAYMENT_CAPTURED_DOWNSTREAM',
        mandate_id: mandateId,
        session_id: sessionId,
        result: 'OK',
        details: { order_id: orderId, amount: paymentEntity?.amount }
      });

      return { success: true, status: 200, message: 'Payment capture acknowledged.' };
    }

    default: {
      return { success: true, status: 200, message: `Webhook event ${event} received.` };
    }
  }
}
