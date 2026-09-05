// backend/src/core/mandateSigner.js
import crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';

export const DEFAULT_ISSUER_SECRET = process.env.MANDATE_SECRET_KEY || 'mandate_mirror_super_secret_issuer_key_2026';

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

  const canonicalString = getCanonicalMandatePayload(mandate);
  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
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
