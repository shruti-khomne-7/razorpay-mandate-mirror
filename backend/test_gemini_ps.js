// test_gemini_ps.js — Test the PowerShell-based Gemini client
import dotenv from 'dotenv';
dotenv.config();
import { callGemini, extractText } from './src/agent/geminiClient.js';

console.log('=== GEMINI 3.6 FLASH RAW API TEST (via PowerShell transport) ===\n');

const prompt = `You are an autonomous AI purchasing agent acting on behalf of a principal.
Goal: "Buy weekly groceries under 500 rupees"
Available Mandate Constraints:
- Allowed Categories: ["grocery"]
- Approved Merchants: ["blinkit","bigbasket","zepto"]
- Max Per-Txn: 800.00 rupees
- Cumulative Monthly Cap: 5000.00 rupees

Decide on a specific, realistic purchase to satisfy the goal.
OUTPUT JSON ONLY:
{
  "item_name": "string (specific product title)",
  "category": "string (matching or relevant category)",
  "merchant_id": "string (merchant identifier)",
  "amount_paise": integer (amount in paise, 1 rupee = 100 paise),
  "reasoning": "string (why you selected this item and amount)"
}`;

try {
  const t0 = Date.now();
  const rawResponse = await callGemini(prompt, {
    temperature: 0.2,
    responseMimeType: 'application/json'
  });
  const elapsed = Date.now() - t0;

  console.log(`Total elapsed: ${elapsed}ms\n`);
  console.log('--- RAW GEMINI API RESPONSE ---');
  console.log(JSON.stringify(rawResponse, null, 2));

  const text = extractText(rawResponse);
  console.log('\n--- EXTRACTED GENERATED TEXT ---');
  console.log(text);

  if (text) {
    try {
      const parsed = JSON.parse(text);
      console.log('\n--- PARSED JSON PURCHASE PLAN ---');
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log('(not valid JSON)');
    }
  }
} catch (err) {
  console.error('FAILED:', err.message);
}
