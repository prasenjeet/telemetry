'use strict';

require('dotenv').config();

const path = require('path');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

module.exports = Object.freeze({
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    server: requireEnv('DB_SERVER'),
    port: parseInt(process.env.DB_PORT, 10) || 1433,
    database: requireEnv('DB_NAME'),
    user: requireEnv('DB_USER'),
    password: requireEnv('DB_PASSWORD'),
    options: {
      encrypt: process.env.DB_ENCRYPT !== 'false',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERT === 'true',
    },
  },

  dataDir: process.env.DATA_DIR || path.join(process.cwd(), 'data'),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS, 10) || 5000,
});
