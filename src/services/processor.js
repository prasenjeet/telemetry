'use strict';

let isProcessing = false;
let pollTimer = null;

async function processOneBatch(config, db, fileStore) {
  if (isProcessing) return;
  if (!db.isConnected()) return;

  isProcessing = true;
  try {
    const files = await fileStore.listPending(config);
    for (const filePath of files) {
      await processOneFile(filePath, config, db, fileStore);
    }
  } finally {
    isProcessing = false;
  }
}

async function processOneFile(filePath, config, db, fileStore) {
  const attempts = await fileStore.getAttempts(filePath);
  if (attempts >= 3) {
    // Poison-pill: stop retrying, leave for manual inspection
    return;
  }

  let event;
  try {
    event = await fileStore.readEvent(filePath);
  } catch (err) {
    console.error(`[processor] Failed to read ${filePath}:`, err.message);
    await fileStore.markFailed(filePath, `Read error: ${err.message}`);
    return;
  }

  try {
    await db.insertTelemetryEvent(event);
    await fileStore.markProcessed(filePath, config);
    console.log(`[processor] Processed event ${event.id}`);
  } catch (err) {
    console.error(`[processor] DB insert failed for ${event.id}:`, err.message);
    const newAttempts = await fileStore.markFailed(filePath, err.message);
    if (newAttempts >= 3) {
      console.error(`[processor] Event ${event.id} exceeded max retries — skipping`);
    }
  }
}

function start(config, db, fileStore) {
  // Run immediately on start, then on interval
  processOneBatch(config, db, fileStore).catch(err =>
    console.error('[processor] Batch error:', err.message)
  );
  pollTimer = setInterval(() => {
    processOneBatch(config, db, fileStore).catch(err =>
      console.error('[processor] Batch error:', err.message)
    );
  }, config.pollIntervalMs);
  return pollTimer;
}

function stop() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// Allow standalone execution: node src/services/processor.js
if (require.main === module) {
  const config = require('../config');
  const db = require('./database');
  const fileStore = require('./fileStore');

  fileStore.ensureDirectories(config);

  db.connect(config.db)
    .then(() => {
      console.log('[processor] DB connected, starting poll loop');
      start(config, db, fileStore);
    })
    .catch(err => {
      console.error('[processor] DB connection failed:', err.message);
      process.exit(1);
    });
}

module.exports = { start, stop, processOneBatch };
