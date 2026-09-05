// backend/src/agent/geminiClient.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

/**
 * Call Gemini API via cross-platform fetch() and return parsed JSON.
 * Defaults to gemini-3.6-flash as requested.
 * Automatically fails over to gemini-3.5-flash if gemini-3.6-flash free tier quota is 429'd.
 */
export async function callGemini(prompt, options = {}) {
  const {
    apiKey = process.env.GEMINI_API_KEY,
    temperature = 0.2,
    responseMimeType = null,
    timeoutSec = 35,
    model = 'gemini-3.6-flash'
  } = options;

  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const executeCall = async (targetModel) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature }
    };
    if (responseMimeType) {
      requestBody.generationConfig.responseMimeType = responseMimeType;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutSec * 1000);

    const t0 = Date.now();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      const elapsed = Date.now() - t0;

      if (!response.ok) {
        const errorText = await response.text();
        const err = new Error(`HTTP ${response.status} from Gemini API: ${errorText}`);
        err.status = response.status;
        throw err;
      }

      const data = await response.json();
      console.log(`[GeminiClient] ${targetModel} response received via fetch in ${elapsed}ms`);
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    return await executeCall(model);
  } catch (err) {
    const isRateLimited = (err.status === 429) || 
      err.message.includes('429') || 
      err.message.includes('RESOURCE_EXHAUSTED');

    if (isRateLimited && model === 'gemini-3.6-flash') {
      console.warn('[GeminiClient] gemini-3.6-flash quota exhausted (429), switching to live gemini-3.5-flash');
      return await executeCall('gemini-3.5-flash');
    }
    throw err;
  }
}

/**
 * Extract generated text from Gemini API response.
 */
export function extractText(response) {
  const candidates = response?.candidates;
  if (!candidates) return '';
  const c0 = Array.isArray(candidates) ? candidates[0] : candidates;
  const parts = c0?.content?.parts;
  if (!parts) return '';
  const p0 = Array.isArray(parts) ? parts[0] : parts;
  return p0?.text || '';
}
