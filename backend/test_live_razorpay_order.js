import axios from 'axios';
import { signMandate } from './src/core/mandateSigner.js';

async function testLivePurchase() {
  console.log('--- 1. REGISTERING MANDATE ---');
  const mandateId = `mandate_live_${Date.now()}`;
  const rawMandate = {
    mandate_id: mandateId,
    principal_id: 'principal_shruti',
    agent_id: 'buyer_agent_01',
    valid_from: new Date(Date.now() - 60000).toISOString(),
    valid_until: new Date(Date.now() + 86400000 * 30).toISOString(),
    spend_cap_per_txn: 100000, // ₹1,000 max per txn
    cumulative_cap: 500000,   // ₹5,000 monthly cap
    cumulative_window: 'P1M',
    allowed_categories: ['grocery', 'pantry'],
    merchant_allowlist: ['blinkit', 'zepto'],
    velocity_limit: 50
  };

  // Cryptographically sign with HMAC-SHA256
  const signedMandate = signMandate(rawMandate, process.env.MANDATE_SECRET_KEY || 'mandate_mirror_super_secret_issuer_key_2026');

  // Register mandate in backend
  const confirmRes = await axios.post('http://127.0.0.1:5000/api/v1/mandates/confirm', {
    structured_mandate: signedMandate,
    principal_id: 'principal_shruti'
  });
  console.log('Mandate Registered:', confirmRes.data.mandate?.mandate_id, 'Status:', confirmRes.data.mandate?.status);

  console.log('\n--- 2. EXECUTING PURCHASE INTENT VIA AUTHORIZE GATEWAY ---');
  const authPayload = {
    mandate: signedMandate,
    transaction: {
      amount_paise: 45000, // ₹450.00
      category: 'grocery',
      merchant: 'blinkit',
      nonce: `nonce_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString()
    },
    session_id: `sess_live_${Date.now()}`
  };

  const authRes = await axios.post('http://127.0.0.1:5000/api/v1/authorize', authPayload);
  console.log('\n--- 3. AUTHORIZATION GATEWAY RESPONSE ---');
  console.log('Decision:', authRes.data.decision);
  console.log('Reasoning:', authRes.data.reasoning);
  console.log('Razorpay Order ID:', authRes.data.razorpay_order_id);
  console.log('\n--- 4. RAW RAZORPAY ORDER JSON RESPONSE ---');
  console.log(JSON.stringify(authRes.data.razorpay_order, null, 2));

  console.log('\n--- 5. RAW AUDIT HASH ---');
  console.log('Audit Entry Hash:', authRes.data.audit_entry_hash);
}

testLivePurchase().catch(err => {
  console.error('Test Error:', err.response?.data || err.message);
});
