'use strict';

const sql = require('mssql');

let pool = null;

async function connect(dbConfig) {
  pool = await sql.connect(dbConfig);
  return pool;
}

function isConnected() {
  return pool !== null && pool.connected;
}

async function insertTelemetryEvent(event) {
  const request = pool.request();
  request.input('id', sql.UniqueIdentifier, event.id);
  request.input('received_at', sql.DateTimeOffset, new Date(event.receivedAt));
  request.input('processed_at', sql.DateTimeOffset, new Date());
  request.input('source', sql.NVarChar(255), event.source || null);
  request.input('event_type', sql.NVarChar(100), (event.payload && event.payload.eventType) || null);
  request.input('device_id', sql.NVarChar(255), (event.payload && event.payload.deviceId) || null);
  request.input('session_id', sql.NVarChar(255), (event.payload && event.payload.sessionId) || null);
  request.input('payload', sql.NVarChar(sql.MAX), JSON.stringify(event.payload));

  await request.query(`
    INSERT INTO telemetry_events
      (id, received_at, processed_at, source, event_type, device_id, session_id, payload)
    VALUES
      (@id, @received_at, @processed_at, @source, @event_type, @device_id, @session_id, @payload)
  `);
}

async function getRecentEvents(limit) {
  const request = pool.request();
  request.input('limit', sql.Int, limit);
  const result = await request.query(`
    SELECT TOP (@limit)
      id, received_at, processed_at, source, event_type, device_id, session_id, payload
    FROM telemetry_events
    ORDER BY received_at DESC
  `);
  return result.recordset.map(row => ({
    ...row,
    payload: JSON.parse(row.payload),
  }));
}

async function close() {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

module.exports = { connect, isConnected, insertTelemetryEvent, getRecentEvents, close };
