// Principal API-key authentication for mandate-scoped operations.
// Configure MANDATE_API_KEYS as a JSON object: {"principal_alice":"secret"}.
import crypto from 'node:crypto';

function configuredPrincipals() {
  const raw = process.env.MANDATE_API_KEYS;
  if (!raw) return null;

  try {
    const mapping = JSON.parse(raw);
    if (!mapping || Array.isArray(mapping) || typeof mapping !== 'object') return null;
    return Object.entries(mapping).filter(([principalId, apiKey]) =>
      typeof principalId === 'string' && principalId.length > 0 &&
      typeof apiKey === 'string' && apiKey.length >= 16
    );
  } catch {
    return null;
  }
}

function tokensMatch(received, expected) {
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length &&
    crypto.timingSafeEqual(receivedBytes, expectedBytes);
}

export function requirePrincipalAuth(req, res, next) {
  const principals = configuredPrincipals();
  if (!principals) {
    return res.status(503).json({
      error: 'AUTH_NOT_CONFIGURED',
      message: 'Mandate API authentication is not configured.'
    });
  }

  const authorization = req.get('authorization');
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const apiKey = bearerToken || req.get('x-api-key');
  if (!apiKey) {
    return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'A principal API key is required.' });
  }

  const match = principals.find(([, expectedKey]) => tokensMatch(apiKey, expectedKey));
  if (!match) {
    return res.status(401).json({ error: 'AUTH_INVALID', message: 'The principal API key is invalid.' });
  }

  req.auth = { principal_id: match[0] };
  return next();
}
