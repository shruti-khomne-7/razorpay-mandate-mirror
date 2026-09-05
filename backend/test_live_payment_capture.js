// test_live_payment_capture.js
import axios from 'axios';
import { signMandate } from './src/core/mandateSigner.js';

async function testLivePaymentCapture() {
  console.log('=== TEST: LIVE ORDER + TEST CARD TOKEN + PAYMENT CAPTURE + FRESH STATUS ===\n');

  // 1. Issue and confirm a valid mandate
  const mandateId = `mandate_live_${Date.now()}`;
  const rawMandate = {
    mandate_id: mandateId,
    principal_id: 'principal_shruti',
    agent_id: 'buyer_agent_01',
    valid_from: new Date(Date.now() - 60000).toISOString(),
    valid_until: new Date(Date.now() + 86400000 * 30).toISOString(),
    spend_cap_per_txn: 80000,
    cumulative_cap: 500000,
    cumulative_window: 'P1M',
    allowed_categories: ['grocery'],
    merchant_allowlist: ['blinkit', 'bigbasket', 'zepto'],
    velocity_limit: 50
  };

  const signed = signMandate(rawMandate);
  await axios.post('http://127.0.0.1:5000/api/v1/mandates/confirm', {
    structured_mandate: signed,
    principal_id: 'principal_shruti'
  });
  console.log('Mandate confirmed:', mandateId);

  // 2. Dispatch authorization request with unique session_id and request_id
  const sessionId = `live_pay_${Date.now()}`;
  const transaction = {
    amount_paise: 32000,
    category: 'grocery',
    merchant: 'blinkit',
    item_name: 'Organic Avocados (2 pcs) and Fresh Whole Milk (1L)',
    nonce: `nonce_${sessionId}`,
    timestamp: new Date().toISOString()
  };

  console.log('Sending authorization request to POST /api/v1/authorize...');
  const t0 = Date.now();
  const res = await axios.post('http://127.0.0.1:5000/api/v1/authorize', {
    mandate: signed,
    transaction,
    session_id: sessionId,
    request_id: sessionId
  }, {
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': sessionId
    }
  });

  const elapsed = Date.now() - t0;
  console.log(`\n=== 1. AUTHORIZATION & PAYMENT CAPTURE RESPONSE (${elapsed}ms) ===`);
  console.log('Decision:', res.data.decision);
  console.log('Razorpay Order ID:', res.data.razorpay_order_id);
  console.log('Razorpay Full Order Object:');
  console.log(JSON.stringify(res.data.razorpay_order, null, 2));

  // 3. Test Idempotency Retry: send the exact same request again
  console.log('\n=== 2. IDEMPOTENCY RETRY TEST ===');
  console.log('Resending exact same X-Request-Id to verify idempotency cache prevents double-charging...');
  const retryRes = await axios.post('http://127.0.0.1:5000/api/v1/authorize', {
    mandate: signed,
    transaction,
    session_id: sessionId,
    request_id: sessionId
  }, {
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': sessionId
    }
  });

  console.log('Retry Decision:', retryRes.data.decision);
  console.log('Replayed Order ID:', retryRes.data.razorpay_order_id);
  console.log('Identical Payment ID:', retryRes.data.razorpay_order?.payment_id === res.data.razorpay_order?.payment_id);
  console.log('Identical Audit Hash:', retryRes.data.audit_entry_hash === res.data.audit_entry_hash);
}

testLivePaymentCapture().catch(err => {
  console.error('Test failed:', err.response?.data || err.message);
  process.exit(1);
});
