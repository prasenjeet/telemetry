'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const db = require('../services/database');
const fileStore = require('../services/fileStore');

const router = express.Router();

// POST /api/telemetry — accept an event, write to flat file, return 202
router.post('/', async (req, res, next) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Request body must be a JSON object' });
  }

  const event = {
    id: uuidv4(),
    receivedAt: new Date().toISOString(),
    source: req.ip,
    payload: req.body,
  };

  try {
    await fileStore.writePending(event, config);
    res.status(202).json({ id: event.id, status: 'queued' });
  } catch (err) {
    next(err);
  }
});

// GET /api/telemetry?limit=50 — query DB or fall back to flat files
router.get('/', async (req, res, next) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);

  try {
    if (db.isConnected()) {
      const events = await db.getRecentEvents(limit);
      return res.json({ events, count: events.length, source: 'database', limit });
    }

    // DB unavailable — serve from flat files
    const events = await fileStore.readPendingFiles(config, limit);
    res.json({
      events,
      count: events.length,
      source: 'fallback',
      warning: 'DB unavailable — showing buffered events from flat files',
      limit,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
