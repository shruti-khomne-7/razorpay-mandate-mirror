// backend/src/core/mandateSigner.js
import crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';

// A deployment must provide its own secret. A source-controlled fallback would
// let anyone forge a valid mandate outside the service.
export const DEFAULT_ISSUER_SECRET = process.env.MANDATE_SECRET_KEY;

function issuerSecret(secretKey) {
  if (!secretKey || typeof secretKey !== 'string' || secretKey.length < 16) {
    throw new Error('MANDATE_SECRET_KEY must be configured with at least 16 characters.');
  }
  return secretKey;
}

/**
 * Extracts signed fields from a mandate object (excludes existing signature)
 */
export function getCanonicalMandatePayload(mandate) {
  const { signature, ...canonicalFields } = mandate;
  return stringify(canonicalFields);
}

/**
 * Digitally signs a mandate using HMAC-SHA256 over its canonical JSON representation
 */
export function signMandate(mandate, secretKey = DEFAULT_ISSUER_SECRET) {
  secretKey = issuerSecret(secretKey);
  const canonicalString = getCanonicalMandatePayload(mandate);
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(canonicalString)
    .digest('hex');

  return {
    ...mandate,
    signature
  };
}

/**
 * Verifies the integrity and authenticity of a mandate signature
 */
export function verifyMandateSignature(mandate, secretKey = DEFAULT_ISSUER_SECRET) {
  if (!mandate || !mandate.signature) {
    return { valid: false, reason: 'MISSING_SIGNATURE' };
  }

  let signingSecret;
  try {
    signingSecret = issuerSecret(secretKey);
  } catch {
    return { valid: false, reason: 'SIGNING_SECRET_NOT_CONFIGURED' };
  }

  const canonicalString = getCanonicalMandatePayload(mandate);
  const expectedSignature = crypto
    .createHmac('sha256', signingSecret)
    .update(canonicalString)
    .digest('hex');

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(mandate.signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
    return { valid: isValid, reason: isValid ? null : 'INVALID_SIGNATURE' };
  } catch {
    return { valid: false, reason: 'MALFORMED_SIGNATURE_HEX' };
  }
}
