// backend/src/core/auditLog.js
/**
 * Decision logger delegating directly to the cryptographic auditChain module.
 * Formalizes all decision points from M1 onward into an immutable SHA-256 hash chain.
 */
export { logDecision } from './auditChain.js';
