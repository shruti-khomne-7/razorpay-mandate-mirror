// test_https_agent.js — test with explicit https.Agent family:4
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import dotenv from 'dotenv';
dotenv.config();
import https from 'node:https';

const apiKey = process.env.GEMINI_API_KEY;

// First resolve the IP ourselves
dns.lookup('generativelanguage.googleapis.com', { family: 4 }, (err, address) => {
  if (err) { console.error('DNS error:', err); process.exit(1); }
  console.log('Resolved IP:', address);

  const postData = JSON.stringify({
    contents: [{ parts: [{ text: 'Return only: {"status":"ok"}' }] }],
    generationConfig: { responseMimeType: 'application/json' }
  });

  const agent = new https.Agent({ family: 4, keepAlive: false });

  const t0 = Date.now();
  console.log('Connecting to', address, '...');

  const req = https.request({
    hostname: address,
    path: `/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'Host': 'generativelanguage.googleapis.com'
    },
    servername: 'generativelanguage.googleapis.com',
    agent: agent,
    timeout: 15000
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log(`\nHTTP ${res.statusCode} in ${Date.now()-t0}ms`);
      console.log(body.substring(0, 500));
    });
  });

  req.on('error', e => console.error(`Error ${Date.now()-t0}ms:`, e.message));
  req.on('timeout', () => { console.error(`TIMEOUT ${Date.now()-t0}ms`); req.destroy(); });
  req.write(postData);
  req.end();
});
