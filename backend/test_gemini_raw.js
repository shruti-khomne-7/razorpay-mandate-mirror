import dotenv from 'dotenv';
dotenv.config();

async function checkGeminiRaw() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('API Key configured:', !!apiKey);
  console.log('Key prefix:', apiKey ? apiKey.substring(0, 7) + '...' : 'none');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

  const goal = "Buy organic avocados and fresh milk for breakfast around ₹320 from Blinkit.";
  const mandate = {
    allowed_categories: ['grocery', 'dairy'],
    merchant_allowlist: ['blinkit', 'zepto'],
    spend_cap_per_txn: 100000,
    cumulative_cap: 500000
  };

  const prompt = `You are an autonomous AI purchasing agent acting on behalf of a principal.
Goal: "${goal}"
Available Mandate Constraints:
- Allowed Categories: ${JSON.stringify(mandate.allowed_categories)}
- Approved Merchants: ${JSON.stringify(mandate.merchant_allowlist)}
- Max Per-Txn: ₹${(mandate.spend_cap_per_txn / 100).toFixed(2)}
- Cumulative Monthly Cap: ₹${(mandate.cumulative_cap / 100).toFixed(2)}

Decide on a specific, realistic purchase to satisfy the goal.
OUTPUT JSON ONLY:
{
  "item_name": "string (specific product title)",
  "category": "string (matching or relevant category)",
  "merchant_id": "string (merchant identifier)",
  "amount_paise": integer (amount in paise, ₹1 = 100 paise),
  "reasoning": "string (why you selected this item and amount)"
}`;

  const body = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  };

  console.log('\n--- SENDING RAW HTTP POST TO GOOGLE GEMINI API ---');
  console.log('URL: https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    console.log('\n--- RAW HTTP RESPONSE FROM GEMINI API ---');
    console.log('HTTP Status Code:', response.status, response.statusText);
    const headers = {};
    for (const [k, v] of response.headers.entries()) {
      if (k.toLowerCase().includes('content-type') || k.toLowerCase().includes('date') || k.toLowerCase().includes('vary')) {
        headers[k] = v;
      }
    }
    console.log('Headers:', JSON.stringify(headers, null, 2));

    const text = await response.text();
    console.log('\nHTTP Response Body:');
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      console.log(text);
    }
  } catch (err) {
    console.error('Network/Fetch Error:', err);
  }
}

checkGeminiRaw();
