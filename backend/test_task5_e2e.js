// test_task5_e2e.js
import axios from 'axios';

async function runTest() {
  console.log('=== TASK 5: E2E VERIFICATION TEST ===\n');

  const mandatePayload = {
    structured_mandate: {
      mandate_id: `mandate_grocery_${Date.now()}`,
      principal_id: 'principal_test_user',
      agent_id: 'grocery_buyer_agent',
      spend_cap_per_txn: 80000,
      cumulative_cap: 500000,
      cumulative_window: 'P1M',
      allowed_categories: ['grocery'],
      merchant_allowlist: ['blinkit', 'bigbasket', 'zepto', 'swiggy_instamart'],
      valid_from: new Date().toISOString(),
      valid_until: new Date(Date.now() + 365 * 86400000).toISOString()
    },
    principal_id: 'principal_test_user'
  };

  console.log('1. Confirming & signing mandate via POST /api/v1/mandates/confirm...');
  const confirmRes = await axios.post('http://127.0.0.1:5000/api/v1/mandates/confirm', mandatePayload);
  const mandateId = confirmRes.data.mandate.mandate_id;
  console.log('✔ Mandate active & signed:', mandateId, 'Signature:', confirmRes.data.mandate.signature.substring(0, 20) + '...');

  const goal = 'I need rice and tomatoes for this week';
  console.log('\n2. Triggering Buyer Agent via POST /api/v1/buyer/shop with goal:', `"${goal}"`);
  const shopRes = await axios.post('http://127.0.0.1:5000/api/v1/buyer/shop', {
    goal,
    mandate_id: mandateId,
    agent_id: 'grocery_buyer_agent'
  });

  console.log('\n--- BUYER AGENT RESULT ---');
  console.log('Purchase Plan:', JSON.stringify(shopRes.data.purchase_plan, null, 2));
  console.log('Gateway Decision:', shopRes.data.auth_outcome?.decision);
  console.log('Razorpay Order:', shopRes.data.auth_outcome?.razorpay_order?.order_id);
  console.log('Razorpay Payment:', shopRes.data.auth_outcome?.razorpay_order?.payment_id);
  console.log('Razorpay Status:', shopRes.data.auth_outcome?.razorpay_order?.payment_status);

  console.log('\n3. Verifying BUYER_AUTH_RESULT in audit log...');
  const auditRes = await axios.get('http://127.0.0.1:5000/api/v1/audit/logs');
  const logs = auditRes.data.logs || [];
  const buyerResultLog = logs.find(l => l.event === 'BUYER_AUTH_RESULT' && l.mandate_id === mandateId);

  if (buyerResultLog) {
    console.log('✔ Audit log entry found in DB:');
    console.log('  Event:', buyerResultLog.event);
    console.log('  Result:', buyerResultLog.result);
    console.log('  Session ID:', buyerResultLog.session_id);
    console.log('  Mandate ID:', buyerResultLog.mandate_id);
  } else {
    console.log('No specific log found, last 3:', logs.slice(-3));
  }
}

runTest().catch(err => {
  console.error('Test Error:', err.response?.data || err.message);
});
