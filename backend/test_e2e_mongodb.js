// backend/test_e2e_mongodb.js
import axios from 'axios';
import { MongoClient } from 'mongodb';

const BASE_URL = 'http://localhost:5000';
const MONGO_URI = 'mongodb://127.0.0.1:27017';
const DB_NAME = 'mandate_mirror';

async function runEndToEndVerification() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('   MANDATE MIRROR: END-TO-END MONGODB & CONCURRENCY VERIFICATION SUITE');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  // ── Step 1: Create mandate via Natural Language Parse & Confirm ────
  console.log('STEP 1: Issuing natural language mandate...');
  const parseRes = await axios.post(`${BASE_URL}/api/v1/mandates/parse`, {
    natural_text: 'Alice authorizes Groq-Shopper-Bot to spend up to Rs 500 per transaction, cumulative cap Rs 1,000 per month on groceries from Blinkit or Zepto',
    principal_id: 'principal_alice'
  });
  const structuredMandate = parseRes.data.structured_mandate;
  console.log(` ✓ Parsed Mandate ID: ${structuredMandate.mandate_id}`);
  console.log(`   Per-Txn Cap: ₹${structuredMandate.spend_cap_per_txn / 100}, Cumulative: ₹${structuredMandate.cumulative_cap / 100}`);

  console.log('\nSTEP 2: Cryptographically confirming and signing mandate...');
  const confirmRes = await axios.post(`${BASE_URL}/api/v1/mandates/confirm`, {
    structured_mandate: structuredMandate,
    principal_id: 'principal_alice'
  });
  const signedMandate = confirmRes.data.mandate;
  console.log(` ✓ HMAC Signature: ${signedMandate.signature.slice(0, 24)}...`);
  console.log(` ✓ Status: ${confirmRes.data.config.status}`);

  // ── Step 3: Verify Persistence in MongoDB directly ────────────────
  console.log('\nSTEP 3: Direct MongoDB verification of stored mandate...');
  const mandateInMongo = await db.collection('mandate_configs').findOne({ mandate_id: signedMandate.mandate_id });
  if (!mandateInMongo) throw new Error('Mandate not found in MongoDB!');
  console.log(` ✓ Mandate verified in MongoDB: ${mandateInMongo.mandate_id} (version ${mandateInMongo.version})`);

  // ── Step 4: View Mandate via API ──────────────────────────────────
  console.log('\nSTEP 4: Fetching registered mandates via API...');
  const listRes = await axios.get(`${BASE_URL}/api/v1/mandates`);
  const found = listRes.data.mandates.find(m => m.mandate_id === signedMandate.mandate_id);
  if (!found) throw new Error('Mandate not listed in GET /mandates!');
  console.log(` ✓ Mandate present in GET /mandates (${listRes.data.mandates.length} total active)`);

  // ── Step 5: Authorize Legitimate Transaction (₹350) ───────────────
  console.log('\nSTEP 5: Authorizing legitimate transaction of ₹350.00 (35,000 paise)...');
  const txn1 = {
    amount_paise: 35000,
    merchant: 'Blinkit',
    category: 'grocery',
    nonce: `nonce_e2e_${Date.now()}_1`
  };
  const authRes1 = await axios.post(`${BASE_URL}/api/v1/authorize`, {
    mandate: signedMandate,
    transaction: txn1,
    session_id: `sess_e2e_legit_${Date.now()}`,
    request_id: `req_e2e_legit_${Date.now()}`
  });
  console.log(` ✓ Decision: ${authRes1.data.decision}`);
  console.log(` ✓ Reasoning: ${authRes1.data.reasoning}`);
  console.log(` ✓ Audit Entry Hash: ${authRes1.data.audit_entry_hash?.slice(0, 16)}...`);

  // ── Step 6: Verify Atomic State Update in MongoDB ─────────────────
  console.log('\nSTEP 6: Verifying atomic bucket spend in MongoDB...');
  const bucketInMongo = await db.collection('buckets').findOne({ mandate_id: signedMandate.mandate_id });
  if (!bucketInMongo) throw new Error('Bucket not created in MongoDB!');
  console.log(` ✓ MongoDB Bucket Cumulative Spend: ₹${bucketInMongo.cumulative_spend / 100}`);
  if (bucketInMongo.cumulative_spend !== 35000) {
    throw new Error(`Expected cumulative spend 35000 paise, got ${bucketInMongo.cumulative_spend}`);
  }

  // ── Step 7: Verify Hash-Chained Audit Trail in MongoDB ────────────
  console.log('\nSTEP 7: Verifying SHA-256 hash-chain in MongoDB audit logs...');
  const allAuditDocs = await db.collection('audit_logs').find({}).sort({ _id: 1 }).toArray();
  console.log(` ✓ Found ${allAuditDocs.length} global audit records in MongoDB`);
  for (let i = 1; i < allAuditDocs.length; i++) {
    if (allAuditDocs[i].prev_entry_hash !== allAuditDocs[i - 1].entry_hash) {
      throw new Error(`Hash chain broken at index ${i}`);
    }
  }
  console.log(' ✓ Direct MongoDB hash chain check: All adjacent global records match');

  const verifyApiRes = await axios.get(`${BASE_URL}/api/v1/audit/verify`);
  if (!verifyApiRes.data.valid) throw new Error('GET /audit/verify failed!');
  console.log(` ✓ API Verification: ${verifyApiRes.data.message}`);

  // ── Step 8: Concurrent Authorization Requests (Race Condition Test)
  console.log('\nSTEP 8: Firing 10 CONCURRENT authorization requests of ₹400.00 each...');
  console.log('   (Remaining cap: ₹650.00. Exactly 1 request can succeed; 9 must be rejected)');

  const concurrentRequests = Array.from({ length: 10 }, (_, i) => {
    return axios.post(`${BASE_URL}/api/v1/authorize`, {
      mandate: signedMandate,
      transaction: {
        amount_paise: 40000, // ₹400
        merchant: 'Blinkit',
        category: 'grocery',
        nonce: `nonce_race_${Date.now()}_${i}`
      },
      session_id: `sess_race_${Date.now()}_${i}`,
      request_id: `req_race_${Date.now()}_${i}`
    });
  });

  const raceResults = await Promise.all(concurrentRequests);
  const cleared = raceResults.filter(r => r.data.decision === 'CLEAR');
  const blocked = raceResults.filter(r => r.data.decision === 'HARD-BLOCK' || r.data.decision !== 'CLEAR');

  console.log(`\n ── Race Results ──`);
  console.log(` ✓ Succeeded (CLEAR): ${cleared.length}`);
  console.log(` ✓ Rejected (HARD-BLOCK): ${blocked.length}`);

  if (cleared.length !== 1) {
    throw new Error(`Concurrency race failed: Expected exactly 1 winner, got ${cleared.length}`);
  }
  if (blocked.length !== 9) {
    throw new Error(`Expected exactly 9 blocked, got ${blocked.length}`);
  }

  // ── Step 9: Verify Cumulative Spend Cap Invariant in MongoDB ──────
  const finalBucket = await db.collection('buckets').findOne({ mandate_id: signedMandate.mandate_id });
  console.log(`\nSTEP 9: Final cumulative spend in MongoDB: ₹${finalBucket.cumulative_spend / 100}`);
  console.log(`   Expected: ₹750.00 (₹350 initial + ₹400 single winner)`);
  if (finalBucket.cumulative_spend !== 75000) {
    throw new Error(`Cap invariant violated! Cumulative spend is ${finalBucket.cumulative_spend}, expected 75000`);
  }
  console.log(' ✓ INVARIANT HOLDS: Spend never exceeded cumulative cap of ₹1,000.00');

  await client.close();
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('       ALL END-TO-END TESTS & MONGODB INVARIANTS PASSED (100%)');
  console.log('═══════════════════════════════════════════════════════════════════════\n');
}

runEndToEndVerification().catch(err => {
  console.error('\n❌ E2E TEST FAILED:', err.response?.data || err.message);
  process.exit(1);
});
