// test_https_raw.js — raw node:https with family:4 forced
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import dotenv from 'dotenv';
dotenv.config();
import https from 'node:https';

const apiKey = process.env.GEMINI_API_KEY;
const postData = JSON.stringify({
  contents: [{ parts: [{ text: 'Return only this JSON object: {"status":"ok","model":"gemini-3.6-flash"}' }] }],
  generationConfig: { responseMimeType: 'application/json' }
});

const t0 = Date.now();
console.log('Sending raw HTTPS request with family:4...');

const req = https.request({
  hostname: 'generativelanguage.googleapis.com',
  path: `/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  },
  family: 4,
  timeout: 20000
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const elapsed = Date.now() - t0;
    console.log(`\n=== RAW HTTP RESPONSE (${elapsed}ms) ===`);
    console.log(`HTTP Status: ${res.statusCode} ${res.statusMessage}`);
    console.log(`Content-Type: ${res.headers['content-type']}`);
    console.log(`\n--- FULL RESPONSE BODY ---`);
    console.log(body);
  });
});

req.on('error', (e) => {
  console.error(`Error after ${Date.now() - t0}ms:`, e.message);
});

req.on('timeout', () => {
  console.error(`TIMEOUT after ${Date.now() - t0}ms`);
  req.destroy();
});

req.write(postData);
req.end();
