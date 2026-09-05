import axios from 'axios';
import { signMandate } from './src/core/mandateSigner.js';

async function testSSEStream() {
  const mandateId = `mandate_sse_${Date.now()}`;
  const rawMandate = {
    mandate_id: mandateId,
    principal_id: 'principal_shruti',
    agent_id: 'buyer_agent_01',
    valid_from: new Date(Date.now() - 60000).toISOString(),
    valid_until: new Date(Date.now() + 86400000 * 30).toISOString(),
    spend_cap_per_txn: 100000,
    cumulative_cap: 500000,
    cumulative_window: 'P1M',
    allowed_categories: ['grocery'],
    merchant_allowlist: ['blinkit'],
    velocity_limit: 50
  };

  const signedMandate = signMandate(rawMandate, process.env.MANDATE_SECRET_KEY || 'mandate_mirror_super_secret_issuer_key_2026');

  // Register
  await axios.post('http://127.0.0.1:5000/api/v1/mandates/confirm', {
    structured_mandate: signedMandate,
    principal_id: 'principal_shruti'
  });

  console.log('CONNECTING TO LIVE SSE STREAM (POST /api/v1/authorize?stream=true)...\n');

  const res = await axios.post(
    'http://127.0.0.1:5000/api/v1/authorize?stream=true',
    {
      mandate: signedMandate,
      transaction: {
        amount_paise: 28000, // ₹280
        category: 'grocery',
        merchant: 'blinkit',
        nonce: `nonce_sse_${Date.now()}`,
        timestamp: new Date().toISOString()
      },
      session_id: `sess_sse_${Date.now()}`
    },
    {
      headers: {
        'Accept': 'text/event-stream'
      },
      responseType: 'stream'
    }
  );

  res.data.on('data', chunk => {
    process.stdout.write(chunk.toString());
  });

  return new Promise(resolve => {
    res.data.on('end', () => {
      console.log('\n--- SSE STREAM FINISHED ---');
      resolve();
    });
  });
}

testSSEStream().catch(console.error);
