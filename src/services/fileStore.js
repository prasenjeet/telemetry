'use strict';

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const MAX_RETRIES = 3;

function pendingDir(config) {
  return path.join(config.dataDir, 'pending');
}

function processedDir(config) {
  return path.join(config.dataDir, 'processed');
}

function todayBucket(config) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(processedDir(config), today);
}

function ensureDirectories(config) {
  fs.mkdirSync(pendingDir(config), { recursive: true });
  fs.mkdirSync(processedDir(config), { recursive: true });
}

async function writePending(event, config) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}_${event.id}.json`;
  const filePath = path.join(pendingDir(config), filename);
  await fsp.writeFile(filePath, JSON.stringify(event, null, 2), 'utf8');
  return filePath;
}

async function listPending(config) {
  const dir = pendingDir(config);
  const entries = await fsp.readdir(dir);
  return entries
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => path.join(dir, f));
}

async function readEvent(filePath) {
  const raw = await fsp.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function markProcessed(filePath, config) {
  const bucket = todayBucket(config);
  fs.mkdirSync(bucket, { recursive: true });
  const dest = path.join(bucket, path.basename(filePath));
  try {
    await fsp.rename(filePath, dest);
  } catch (err) {
    // rename across devices (rare): fall back to copy + delete
    if (err.code === 'EXDEV') {
      await fsp.copyFile(filePath, dest);
      await fsp.unlink(filePath);
    } else {
      throw err;
    }
  }
  // Remove sidecar error file if it exists
  const errorFile = filePath + '.error';
  await fsp.unlink(errorFile).catch(() => {});
}

async function markFailed(filePath, reason) {
  const errorFile = filePath + '.error';
  let attempts = 1;
  try {
    const existing = JSON.parse(await fsp.readFile(errorFile, 'utf8'));
    attempts = (existing.attempts || 0) + 1;
  } catch (_) {}

  await fsp.writeFile(
    errorFile,
    JSON.stringify({ failedAt: new Date().toISOString(), reason, attempts }, null, 2),
    'utf8'
  );
  return attempts;
}

async function getAttempts(filePath) {
  const errorFile = filePath + '.error';
  try {
    const data = JSON.parse(await fsp.readFile(errorFile, 'utf8'));
    return data.attempts || 0;
  } catch (_) {
    return 0;
  }
}

async function readPendingFiles(config, limit) {
  const files = await listPending(config);
  const events = [];
  for (const f of files.slice(0, limit)) {
    try {
      events.push(await readEvent(f));
    } catch (_) {}
  }
  return events;
}

module.exports = {
  ensureDirectories,
  writePending,
  listPending,
  readEvent,
  markProcessed,
  markFailed,
  getAttempts,
  readPendingFiles,
};
