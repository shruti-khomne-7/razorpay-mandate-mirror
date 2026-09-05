import axios from 'axios';
import { signMandate } from './src/core/mandateSigner.js';

async function testBuyerAgentWithLLM() {
  const mandateId = `mandate_gemini_${Date.now()}`;
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

  console.log('--- CALLING BUYER AGENT ROUTE (POST /api/v1/buyer/shop) ---');
  const goal = 'Buy organic avocados and fresh milk for breakfast around ₹320 from Blinkit.';

  const buyerRes = await axios.post('http://127.0.0.1:5000/api/v1/buyer/shop', {
    goal,
    mandate_id: mandateId,
    agent_id: 'buyer_agent_01'
  });

  console.log('\n--- BUYER AGENT FULL RESPONSE ---');
  console.log(JSON.stringify(buyerRes.data, null, 2));
}

testBuyerAgentWithLLM().catch(err => {
  console.error('Buyer Agent Error:', err.response?.data || err.message);
});
