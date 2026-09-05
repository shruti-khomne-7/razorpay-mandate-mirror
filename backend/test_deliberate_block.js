import axios from 'axios';
import { signMandate } from './src/core/mandateSigner.js';
import { MongoClient } from 'mongodb';

async function testDeliberateBlock() {
  console.log('=== DELIBERATELY TRIGGERED FAILURE TEST ===\n');

  const mandateId = `mandate_fail_${Date.now()}`;
  const rawMandate = {
    mandate_id: mandateId,
    principal_id: 'principal_shruti',
    agent_id: 'buyer_agent_01',
    valid_from: new Date(Date.now() - 60000).toISOString(),
    valid_until: new Date(Date.now() + 86400000 * 30).toISOString(),
    spend_cap_per_txn: 100000, // ₹1,000 max per txn
    cumulative_cap: 500000,   // ₹5,000 monthly cap
    cumulative_window: 'P1M',
    allowed_categories: ['grocery', 'dairy'],
    merchant_allowlist: ['blinkit', 'zepto'],
    velocity_limit: 50
  };

  const signedMandate = signMandate(rawMandate, process.env.MANDATE_SECRET_KEY || 'mandate_mirror_super_secret_issuer_key_2026');

  // Register mandate
  await axios.post('http://127.0.0.1:5000/api/v1/mandates/confirm', {
    structured_mandate: signedMandate,
    principal_id: 'principal_shruti'
  });

  console.log('1. DISPATCHING BUYER AGENT FOR OUT-OF-SCOPE ELECTRONICS...');
  const goal = 'Buy a USB-C fast phone charger and earbuds for ₹1,200 from Amazon.';

  const buyerRes = await axios.post('http://127.0.0.1:5000/api/v1/buyer/shop', {
    goal,
    mandate_id: mandateId,
    agent_id: 'buyer_agent_01'
  });

  console.log('\n--- BUYER AGENT OUTCOME ---');
  console.log('Purchase Planned:', buyerRes.data.purchase_plan?.item_name);
  console.log('Planned Category:', buyerRes.data.purchase_plan?.category);
  console.log('Planned Merchant:', buyerRes.data.purchase_plan?.merchant_id);
  console.log('Planned Amount:', `₹${(buyerRes.data.purchase_plan?.amount_paise / 100).toFixed(2)}`);
  console.log('\nGateway Decision:', buyerRes.data.auth_outcome?.decision);
  console.log('Rule Cited:', buyerRes.data.auth_outcome?.rule_cited);
  console.log('Reason:', buyerRes.data.auth_outcome?.reason);
  console.log('Razorpay Order (MUST BE NULL):', buyerRes.data.auth_outcome?.razorpay_order || null);
  console.log('\nAI Plain-Language Explanation (Call 2):');
  console.log(`"${buyerRes.data.principal_explanation}"`);

  console.log('\n2. INSPECTING PERSISTED BLOCK IN MONGODB AUDIT LOGS...');
  const client = new MongoClient('mongodb://127.0.0.1:27017/mandate_mirror');
  await client.connect();
  const db = client.db('mandate_mirror');
  const auditRecord = await db.collection('audit_logs').findOne({
    mandate_id: mandateId,
    final_decision: 'HARD-BLOCK'
  });

  console.log('\n--- RAW MONGODB AUDIT LOG ENTRY ---');
  console.log(JSON.stringify(auditRecord, null, 2));
  await client.close();
}

testDeliberateBlock().catch(err => {
  console.error('Failure test error:', err.response?.data || err.message);
});
