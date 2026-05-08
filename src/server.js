'use strict';

const express = require('express');
const db = require('./services/database');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: db.isConnected() ? 'connected' : 'disconnected',
    uptime: Math.floor(process.uptime()),
  });
});

app.use('/api/telemetry', require('./routes/telemetry'));

app.use(errorHandler);

module.exports = app;
