'use strict';

require('dotenv').config();

const path = require('path');

// Returns the env var value, or null if not set (DB connection is optional at startup)
function optionalEnv(name) {
  return process.env[name] || null;
}

const dbConfigured =
  process.env.DB_SERVER && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD;

module.exports = Object.freeze({
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  dbConfigured: Boolean(dbConfigured),

  db: {
    server: optionalEnv('DB_SERVER'),
    port: parseInt(process.env.DB_PORT, 10) || 1433,
    database: optionalEnv('DB_NAME'),
    user: optionalEnv('DB_USER'),
    password: optionalEnv('DB_PASSWORD'),
    options: {
      encrypt: process.env.DB_ENCRYPT !== 'false',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERT === 'true',
    },
  },

  dataDir: process.env.DATA_DIR || path.join(process.cwd(), 'data'),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS, 10) || 5000,
});
