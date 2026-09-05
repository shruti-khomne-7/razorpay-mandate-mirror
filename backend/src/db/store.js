// backend/src/db/store.js
import {
  persistMandateConfig,
  persistBucket,
  persistAuditLog,
  persistIdempotency,
  loadMongoIntoStore,
  connectMongo,
  isMongoConnected
} from './mongo.js';

/**
 * Concurrency-Safe Document Store with Persistent MongoDB Source of Truth.
 *
 * Collections:
 *   mandateConfigs — mandate configuration (no spend counters). Key: mandate_id
 *   buckets        — period spend buckets. Key: "{mandate_id}_{periodKey}"
 *   auditLogs      — structured decision log entries (array of chained SHA-256 blocks)
 *   idempotency    — request dedup records. Key: "{mandate_id}:{request_id}"
 *
 * Atomicity primitive: runAtomic(key, fn) — per-key async mutex.
 */
class PersistentDocStore {
  constructor() {
    this.mandateConfigs = new Map();
    this.buckets = new Map();
    this.auditLogs = [];
    this.idempotency = new Map();
    this.seenWebhookEvents = new Set();
    this.orderStatuses = new Map();
    this._locks = new Map();
  }

  async _acquireLock(key) {
    while (this._locks.get(key)) {
      await new Promise(r => setTimeout(r, 1));
    }
    this._locks.set(key, true);
  }

  _releaseLock(key) {
    this._locks.delete(key);
  }

  /**
   * Execute fn() while holding an exclusive lock on key.
   * Every compound read-check-write that must not interleave goes through here.
   */
  async runAtomic(key, fn) {
    await this._acquireLock(key);
    try {
      return await fn();
    } finally {
      this._releaseLock(key);
    }
  }

  // ── Persistent Setters ────────────────────────────────────────────────

  setMandateConfig(mandateId, config) {
    this.mandateConfigs.set(mandateId, config);
    // Asynchronously persist to MongoDB
    persistMandateConfig(config).catch(err =>
      console.error(`[Store] Error persisting mandate ${mandateId}:`, err.message)
    );
  }

  setBucket(bucketKey, bucket) {
    this.buckets.set(bucketKey, bucket);
    // Asynchronously persist to MongoDB
    persistBucket(bucket).catch(err =>
      console.error(`[Store] Error persisting bucket ${bucketKey}:`, err.message)
    );
  }

  appendAuditLog(entry) {
    this.auditLogs.push(entry);
    // Asynchronously persist to MongoDB
    persistAuditLog(entry).catch(err =>
      console.error(`[Store] Error persisting audit entry:`, err.message)
    );
  }

  setIdempotency(key, record) {
    this.idempotency.set(key, record);
    // Asynchronously persist to MongoDB
    persistIdempotency(key, record).catch(err =>
      console.error(`[Store] Error persisting idempotency ${key}:`, err.message)
    );
  }

  async syncFromMongo() {
    await loadMongoIntoStore(this);
  }

  clear() {
    this.mandateConfigs.clear();
    this.buckets.clear();
    this.auditLogs = [];
    this.idempotency.clear();
    this.seenWebhookEvents.clear();
    this.orderStatuses.clear();
    this._locks.clear();
  }
}

export const store = new PersistentDocStore();
