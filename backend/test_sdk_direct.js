import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from '@google/generative-ai';

async function testSDKDirect() {
  console.log('Initializing GoogleGenerativeAI...');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.6-flash',
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
  });

  const prompt = `Decide on a grocery purchase. Output JSON: {"item_name": "Organic Milk", "amount_paise": 6000}`;
  console.log('Calling generateContent...');
  const start = Date.now();
  try {
    const res = await model.generateContent(prompt);
    console.log(`generateContent finished in ${Date.now() - start}ms`);
    console.log('Result:', res.response.text());
  } catch (err) {
    console.error(`generateContent threw error in ${Date.now() - start}ms:`, err);
  }
}

testSDKDirect();
