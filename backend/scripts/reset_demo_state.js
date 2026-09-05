// Explicit pre-demo reset. It is deliberately not imported by server startup.
import { connectMongo, clearPersistentDemoState, closeMongo } from '../src/db/mongo.js';
import { store } from '../src/db/store.js';

try {
  const db = await connectMongo();
  if (!db) throw new Error('MongoDB connection failed; refusing to claim the demo was reset.');

  const deleted = await clearPersistentDemoState();
  store.clear();
  console.log(`Demo state cleared: ${JSON.stringify(deleted)}`);
  await closeMongo();
} catch (err) {
  console.error(`Demo reset failed: ${err.message}`);
  process.exitCode = 1;
}
