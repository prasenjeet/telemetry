'use strict';

const config = require('./config');
const app = require('./server');
const db = require('./services/database');
const fileStore = require('./services/fileStore');
const processor = require('./services/processor');

async function main() {
  // 1. Ensure data directories exist
  fileStore.ensureDirectories(config);

  // 2. Attempt DB connection (non-fatal — API works without DB)
  if (config.dbConfigured) {
    db.connect(config.db)
      .then(() => console.log('[db] Connected to MS SQL Server'))
      .catch(err => console.warn('[db] Connection failed (will retry on processor cycles):', err.message));
  } else {
    console.warn('[db] No DB credentials configured — running in flat-file-only mode');
  }

  // 3. Start HTTP server
  const server = app.listen(config.port, () => {
    console.log(`[server] Listening on port ${config.port} (${config.nodeEnv})`);
  });

  // 4. Start background processor
  processor.start(config, db, fileStore);
  console.log(`[processor] Polling every ${config.pollIntervalMs}ms`);

  // 5. Graceful shutdown
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[shutdown] Received ${signal}, shutting down gracefully...`);

    processor.stop();

    server.close(async () => {
      await db.close();
      console.log('[shutdown] Done.');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('[shutdown] Timed out, forcing exit');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(err => {
  console.error('[startup] Fatal error:', err.message);
  process.exit(1);
});
