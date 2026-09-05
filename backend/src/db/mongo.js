// backend/src/db/mongo.js
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mandate_mirror';
const DB_NAME = 'mandate_mirror';

let client = null;
let db = null;
let isConnected = false;

export async function connectMongo() {
  if (isConnected && db) return db;

  try {
    client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000
    });

    await client.connect();
    db = client.db(DB_NAME);
    isConnected = true;

    // Create indexes
    await db.collection('mandate_configs').createIndex({ mandate_id: 1 }, { unique: true });
    await db.collection('buckets').createIndex({ bucket_key: 1 }, { unique: true });
    await db.collection('audit_logs').createIndex({ entry_hash: 1 });
    await db.collection('audit_logs').createIndex({ timestamp: -1 });
    await db.collection('idempotency').createIndex({ key: 1 }, { unique: true });

    console.log(`[MongoDB] Connected successfully to ${DB_NAME}`);
    return db;
  } catch (err) {
    console.warn(`[MongoDB] Could not connect to MongoDB at ${MONGODB_URI}: ${err.message}. Operating in memory-backed mode.`);
    isConnected = false;
    return null;
  }
}

export function getDb() {
  return db;
}

export function isMongoConnected() {
  return isConnected;
}

/**
 * Persist or update a mandate configuration in MongoDB.
 */
export async function persistMandateConfig(config) {
  if (!isConnected || !db) return;
  try {
    await db.collection('mandate_configs').updateOne(
      { mandate_id: config.mandate_id },
      { $set: { ...config, _updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (err) {
    console.error(`[MongoDB] Error saving mandate ${config.mandate_id}:`, err.message);
    throw err;
  }
}

/**
 * Delete all stateful demo records. This is intentionally explicit and is
 * never called by server startup, so normal deployments cannot be reset by a
 * restart.
 */
export async function clearPersistentDemoState() {
  if (!isConnected || !db) {
    throw new Error('MongoDB is not connected; persistent demo state could not be cleared.');
  }

  const collections = ['mandate_configs', 'buckets', 'audit_logs', 'idempotency'];
  const deleted = {};
  for (const collection of collections) {
    const result = await db.collection(collection).deleteMany({});
    deleted[collection] = result.deletedCount;
  }
  return deleted;
}

/**
 * Persist or update a spend bucket in MongoDB.
 */
export async function persistBucket(bucket) {
  if (!isConnected || !db) return;
  try {
    await db.collection('buckets').updateOne(
      { bucket_key: bucket.bucket_key },
      { $set: { ...bucket, _updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (err) {
    console.error(`[MongoDB] Error saving bucket ${bucket.bucket_key}:`, err.message);
  }
}

/**
 * Atomic database-enforced spend against MongoDB.
 * Enforces cumulative cap and nonce uniqueness directly at the database layer via findOneAndUpdate.
 */
export async function atomicMongoBucketSpend({
  bucket_key,
  amount_paise,
  cumulative_cap,
  velocity_limit,
  nonce,
  category,
  nowMs,
  initialBucket
}) {
  if (!isConnected || !db) return null;

  try {
    if (initialBucket) {
      await db.collection('buckets').updateOne(
        { bucket_key },
        { $setOnInsert: { ...initialBucket, _updatedAt: new Date() } },
        { upsert: true }
      );
    }

    // Keep database enforcement aligned with the state-machine checks. These
    // predicates run in the same atomic find-and-update as the cap/nonce test.
    const filter = {
      bucket_key,
      $expr: {
        $and: [
          {
            $lte: [
              { $add: [{ $ifNull: ['$cumulative_spend', 0] }, { $ifNull: ['$pending_spend', 0] }, amount_paise] },
              cumulative_cap
            ]
          },
          {
            $lte: [
              { $add: [{ $ifNull: ['$transaction_count', 0] }, 1] },
              velocity_limit
            ]
          }
        ]
      }
    };

    if (nonce) {
      filter.seen_nonces = { $ne: nonce };
    }

    const update = {
      $inc: {
        cumulative_spend: amount_paise,
        transaction_count: 1
      },
      $set: {
        last_transaction_at: new Date(nowMs).toISOString(),
        updated_at: new Date(nowMs).toISOString(),
        _updatedAt: new Date()
      }
    };

    if (nonce) {
      update.$push = {
        seen_nonces: {
          $each: [nonce],
          $slice: -1000
        }
      };
    }

    if (category) {
      update.$inc[`category_histogram.${category}`] = 1;
    }

    const updatedDoc = await db.collection('buckets').findOneAndUpdate(
      filter,
      update,
      { returnDocument: 'after' }
    );

    return updatedDoc;
  } catch (err) {
    console.error(`[MongoDB] atomicMongoBucketSpend failed:`, err.message);
    return null;
  }
}

/**
 * Persist an audit log entry in MongoDB.
 */
export async function persistAuditLog(entry) {
  if (!isConnected || !db) return;
  try {
    await db.collection('audit_logs').insertOne({
      ...entry,
      _createdAt: new Date()
    });
  } catch (err) {
    console.error(`[MongoDB] Error saving audit log:`, err.message);
  }
}

/**
 * Persist idempotency claim in MongoDB.
 */
export async function persistIdempotency(key, record) {
  if (!isConnected || !db) return;
  try {
    await db.collection('idempotency').updateOne(
      { key },
      { $set: { ...record, key, _updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (err) {
    console.error(`[MongoDB] Error saving idempotency ${key}:`, err.message);
  }
}

/**
 * Load all persistent documents from MongoDB into the in-memory store on startup.
 */
export async function loadMongoIntoStore(store) {
  if (!isConnected || !db) return;
  try {
    // 1. Mandates
    const mandates = await db.collection('mandate_configs').find({}).toArray();
    for (const m of mandates) {
      delete m._id;
      delete m._updatedAt;
      store.mandateConfigs.set(m.mandate_id, m);
    }

    // 2. Buckets
    const buckets = await db.collection('buckets').find({}).toArray();
    for (const b of buckets) {
      delete b._id;
      delete b._updatedAt;
      store.buckets.set(b.bucket_key, b);
    }

    // 3. Audit Logs (ordered by natural insertion)
    const logs = await db.collection('audit_logs').find({}).sort({ _id: 1 }).toArray();
    if (logs.length > 0) {
      store.auditLogs = logs.map(l => {
        delete l._id;
        delete l._createdAt;
        return l;
      });
    }

    // 4. Idempotency
    const idempotencyDocs = await db.collection('idempotency').find({}).toArray();
    for (const d of idempotencyDocs) {
      const key = d.key;
      delete d._id;
      delete d.key;
      delete d._updatedAt;
      store.idempotency.set(key, d);
    }

    console.log(`[MongoDB] Loaded state into store: ${mandates.length} mandates, ${buckets.length} buckets, ${logs.length} audit records.`);
  } catch (err) {
    console.error('[MongoDB] Error loading state into store:', err.message);
  }
}

/**
 * Close MongoDB connection gracefully.
 */
export async function closeMongo() {
  if (client) {
    await client.close();
    isConnected = false;
    db = null;
  }
}
