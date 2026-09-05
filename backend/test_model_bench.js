import dotenv from 'dotenv';
dotenv.config();

async function testModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const models = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-2.5-pro', 'gemini-flash-latest'];
  for (const m of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Respond with JSON: {"status":"ok"}' }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });
      console.log(m, 'STATUS:', res.status, res.statusText);
      const text = await res.text();
      console.log(m, 'BODY:', text);
    } catch (e) {
      console.log(m, 'ERR:', e.message);
    }
  }
}

testModels();
