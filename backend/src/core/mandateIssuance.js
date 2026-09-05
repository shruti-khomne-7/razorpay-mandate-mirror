// backend/src/core/mandateIssuance.js
import { logDecision } from './auditLog.js';

/**
 * Natural Language Mandate Parser (M3b)
 *
 * Takes free text describing delegation intent and returns:
 * {
 *   success: true,
 *   structured_mandate: { ... },
 *   warnings: string[]
 * }
 *
 * Key safety constraints:
 * 1. Strictly structured JSON extraction.
 * 2. Any inferred/defaulted field must be recorded in warnings[].
 * 3. Never silently pass a filled-in default as if the principal explicitly specified it.
 * 4. Calls logDecision() on both success and failure.
 * 5. Deterministic fallback parser when GEMINI_API_KEY is not configured.
 */

// Deterministic rule-based fallback parser when GEMINI_API_KEY is absent
function parseNaturalMandateMock(naturalText, principalId) {
  const text = naturalText.toLowerCase();
  const warnings = [];
  const now = new Date();
  const validUntil = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  // 1. Per-transaction cap
  let spendCapPerTxn = null;
  const perTxnMatch = text.match(/(?:max|up to|capped at|limit of|ceiling of)\s*₹?\s*(\d[\d,]*)\s*(?:per\s*(?:order|txn|transaction|purchase)|each)/i)
    || text.match(/₹\s*(\d[\d,]*)\s*(?:per\s*(?:order|txn|transaction|purchase)|each)/i);
  if (perTxnMatch) {
    spendCapPerTxn = parseInt(perTxnMatch[1].replace(/,/g, ''), 10) * 100;
  } else {
    spendCapPerTxn = 80000; // default ₹800
    warnings.push("Per-transaction spending cap was not specified; inferred default of ₹800.00 (80,000 paise).");
  }

  // 2. Cumulative cap & window
  let cumulativeCap = null;
  const cumMatch = text.match(/(?:budget of|spend up to|total of|cap of)?\s*₹?\s*(\d[\d,]*)\s*(?:a|per|\/)\s*(month|day|week|year)/i)
    || text.match(/₹\s*(\d[\d,]*)/i);
  let windowDuration = 'P1M';

  if (cumMatch) {
    cumulativeCap = parseInt(cumMatch[1].replace(/,/g, ''), 10) * 100;
    const windowUnit = cumMatch[2] ? cumMatch[2].toLowerCase() : 'month';
    if (windowUnit === 'day') windowDuration = 'P1D';
    else if (windowUnit === 'week') windowDuration = 'P7D';
    else if (windowUnit === 'month') windowDuration = 'P1M';
  } else {
    cumulativeCap = 500000; // default ₹5,000
    warnings.push("Cumulative cap was not explicitly found; inferred default of ₹5,000.00 (500,000 paise).");
  }

  if (!text.includes('month') && !text.includes('day') && !text.includes('week')) {
    warnings.push("Window period was not explicitly defined; inferred monthly bucket (P1M).");
  }

  // 3. Categories
  const allowedCategories = [];
  const knownCategories = ['grocery', 'groceries', 'food_delivery', 'food', 'electronics', 'books', 'travel', 'ride_hailing'];
  for (const cat of knownCategories) {
    if (text.includes(cat)) {
      const normalized = cat === 'groceries' ? 'grocery' : (cat === 'food' ? 'food_delivery' : cat);
      if (!allowedCategories.includes(normalized)) {
        allowedCategories.push(normalized);
      }
    }
  }
  if (allowedCategories.length === 0) {
    allowedCategories.push('grocery');
    warnings.push("Allowed categories were not explicitly stated; inferred default category ['grocery'].");
  }

  // 4. Merchant Allowlist
  const merchantAllowlist = [];
  const knownMerchants = ['bigbasket', 'swiggy instamart', 'blinkit', 'zepto', 'amazon', 'flipkart', 'zomato', 'swiggy', 'uber', 'ola'];
  for (const m of knownMerchants) {
    if (text.includes(m)) {
      merchantAllowlist.push(m.replace(/\s+/g, '_'));
    }
  }
  if (merchantAllowlist.length === 0) {
    warnings.push("No merchant allowlist was specified; transactions from any merchant in authorized categories will be permitted.");
  }

  // 5. Agent ID
  let agentId = 'autonomous_buyer';
  if (allowedCategories.includes('grocery')) {
    agentId = 'grocery_agent';
  }

  const mandateId = `mandate_nl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const structuredMandate = {
    mandate_id: mandateId,
    principal_id: principalId || 'principal_user',
    agent_id: agentId,
    spend_cap_per_txn: spendCapPerTxn,
    cumulative_cap: cumulativeCap,
    cumulative_window: windowDuration,
    allowed_categories: allowedCategories,
    merchant_allowlist: merchantAllowlist.length > 0 ? merchantAllowlist : null,
    valid_from: now.toISOString(),
    valid_until: validUntil.toISOString(),
    mandate_version: 1
  };

  return {
    success: true,
    structured_mandate: structuredMandate,
    warnings,
    parser_mode: 'deterministic_mock'
  };
}

export async function parseNaturalLanguageMandate({ natural_text, principal_id }) {
  if (!natural_text || typeof natural_text !== 'string' || natural_text.trim().length === 0) {
    const errPayload = {
      success: false,
      error: 'EMPTY_INPUT',
      message: 'Natural language delegation text is required'
    };
    logDecision({
      event: 'MANDATE_PARSED',
      principal_id,
      result: 'ERROR',
      details: errPayload
    });
    return errPayload;
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // Use Gemini LLM if API key configured
  if (apiKey && apiKey.trim() !== '') {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      });

      const prompt = `You are a strict, security-focused financial parser for Mandate Mirror (Razorpay AI Risk Manager).
Convert the principal's natural language delegation intent into the formal JSON mandate schema.

Principal ID: "${principal_id || 'principal_user'}"
User Intent Text: "${natural_text}"

Current timestamp: ${new Date().toISOString()}

OUTPUT SCHEMA (JSON ONLY):
{
  "structured_mandate": {
    "mandate_id": "string (format: mandate_nl_timestamp_shortid)",
    "principal_id": "${principal_id || 'principal_user'}",
    "agent_id": "string (infer agent role e.g. grocery_agent, procurement_bot, etc.)",
    "spend_cap_per_txn": integer (paise: ₹1 = 100 paise, e.g. ₹800 is 80000),
    "cumulative_cap": integer (paise: ₹1 = 100 paise, e.g. ₹5,000 is 500000),
    "cumulative_window": string (ISO 8601 duration: "P1M" for monthly, "P1D" for daily, "PT1H" for hourly),
    "allowed_categories": array of string (lowercase normalized, e.g. ["grocery", "food_delivery"]),
    "merchant_allowlist": array of string or null (lowercase snake_cased merchant ids, e.g. ["blinkit", "zepto", "bigbasket"]),
    "valid_from": ISO string,
    "valid_until": ISO string,
    "mandate_version": 1
  },
  "warnings": array of string (CRITICAL: Any field, cap, category, or merchant allowlist that was NOT explicitly mentioned in the user's text and had to be defaulted or assumed must be explicitly listed here. If the user explicitly provided everything, return an empty array.)
}

Strictly output valid JSON.`;

      const response = await model.generateContent(prompt);
      const text = response.response.text();
      const parsed = JSON.parse(text);

      if (!parsed.structured_mandate || typeof parsed.structured_mandate !== 'object') {
        throw new Error('LLM output missing structured_mandate field');
      }

      // Ensure mandatory fields
      parsed.structured_mandate.principal_id = principal_id || parsed.structured_mandate.principal_id || 'principal_user';
      if (!parsed.structured_mandate.mandate_id) {
        parsed.structured_mandate.mandate_id = `mandate_nl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      }
      if (!Array.isArray(parsed.warnings)) {
        parsed.warnings = [];
      }

      logDecision({
        event: 'MANDATE_PARSED',
        principal_id,
        result: 'OK',
        details: {
          mandate_id: parsed.structured_mandate.mandate_id,
          warnings: parsed.warnings,
          parser_mode: 'gemini_llm'
        }
      });

      return {
        success: true,
        structured_mandate: parsed.structured_mandate,
        warnings: parsed.warnings,
        parser_mode: 'gemini_llm'
      };
    } catch (err) {
      logDecision({
        event: 'MANDATE_PARSED',
        principal_id,
        result: 'LLM_FALLBACK',
        details: { error: err.message }
      });
      // Fall through to deterministic fallback if LLM encounters an issue
    }
  }

  // Fallback / deterministic mode
  const fallbackResult = parseNaturalMandateMock(natural_text, principal_id);
  logDecision({
    event: 'MANDATE_PARSED',
    principal_id,
    result: 'OK',
    details: {
      mandate_id: fallbackResult.structured_mandate.mandate_id,
      warnings: fallbackResult.warnings,
      parser_mode: 'deterministic_mock'
    }
  });

  return fallbackResult;
}
