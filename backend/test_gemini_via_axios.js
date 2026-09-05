// test_gemini_via_axios.js — Direct raw Gemini API call via axios
// Shows the EXACT HTTP status code and FULL JSON response body
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('GEMINI_API_KEY not set'); process.exit(1); }

const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

const prompt = `You are an autonomous AI purchasing agent acting on behalf of a principal.
Goal: "Buy weekly groceries under ₹500"
Available Mandate Constraints:
- Allowed Categories: ["grocery"]
- Approved Merchants: ["blinkit","bigbasket","zepto"]
- Max Per-Txn: ₹800.00
- Cumulative Monthly Cap: ₹5000.00

Decide on a specific, realistic purchase to satisfy the goal.
OUTPUT JSON ONLY:
{
  "item_name": "string (specific product title)",
  "category": "string (matching or relevant category)",
  "merchant_id": "string (merchant identifier)",
  "amount_paise": integer (amount in paise, ₹1 = 100 paise),
  "reasoning": "string (why you selected this item and amount)"
}`;

console.log('=== RAW GEMINI API TEST (axios) ===');
console.log('Model: gemini-3.6-flash');
console.log('Endpoint:', url.replace(apiKey, '***REDACTED***'));
console.log('Sending request...');

const t0 = Date.now();
try {
  const resp = await axios.post(url, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    }
  }, { timeout: 30000 });

  const elapsed = Date.now() - t0;
  console.log(`\n=== RAW HTTP RESPONSE (${elapsed}ms) ===`);
  console.log('HTTP Status:', resp.status, resp.statusText);
  console.log('Content-Type:', resp.headers['content-type']);
  console.log('\n--- FULL RESPONSE BODY (JSON) ---');
  console.log(JSON.stringify(resp.data, null, 2));

  // Extract and parse the generated text
  const generatedText = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (generatedText) {
    console.log('\n--- PARSED GENERATED JSON ---');
    try {
      const parsed = JSON.parse(generatedText);
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log('(raw text, not valid JSON):', generatedText);
    }
  }
} catch (err) {
  const elapsed = Date.now() - t0;
  console.error(`\n=== ERROR (${elapsed}ms) ===`);
  if (err.response) {
    console.error('HTTP Status:', err.response.status, err.response.statusText);
    console.error('Response Body:', JSON.stringify(err.response.data, null, 2));
  } else {
    console.error('Error:', err.message);
  }
}
