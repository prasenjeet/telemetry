# Test Coverage Analysis

## Summary

| Metric | Value |
|--------|-------|
| Total source files | 8 |
| Test files | **0** |
| Estimated line coverage | **0%** |
| Testing framework | None configured |
| Coverage tooling | None configured |

The repository currently has **zero test coverage**. No test files, no testing framework, and no coverage tooling exist anywhere in the project.

---

## Module-by-Module Breakdown

### `src/services/fileStore.js` — 0% covered

The durability layer. Responsible for writing events to disk, tracking retry attempts via `.error` sidecar files, and moving processed files into date-bucketed archive directories.

**Untested behaviours:**
- Filename sanitisation (colons in ISO timestamps replaced with `-`)
- `.json`-only filtering in `listPending`
- Retry counter increments across `markFailed` calls
- `getAttempts` returns `0` when no `.error` file exists
- `markProcessed` moves the file and removes any sidecar
- EXDEV fallback in `markProcessed` (cross-device rename → copy + delete)
- `readPendingFiles` silently skips malformed JSON

---

### `src/services/processor.js` — 0% covered

The background batch worker. Polls the pending directory and inserts events into SQL Server.

**Untested behaviours:**
- Concurrency guard (`isProcessing` flag prevents overlapping runs)
- DB-connection guard (batch skipped when `db.isConnected()` is false)
- Poison-pill logic (files with ≥ 3 recorded attempts are silently skipped)
- Retry accounting (DB insert failure → `markFailed` → logs when `newAttempts >= 3`)
- Read failure path (`readEvent` throws → `markFailed` with `"Read error:"` reason)
- `stop()` clears the interval and nulls `pollTimer`

---

### `src/routes/telemetry.js` — 0% covered

The public REST API surface.

**Untested behaviours:**
- `POST` with a valid object body → 202 with `{ id, status: 'queued' }`
- `POST` with an array body → 400
- `POST` with a non-object body (string, null) → 400
- `POST` when `fileStore.writePending` throws → 500 via error handler
- `GET` when DB is connected → `source: 'database'`
- `GET` when DB is disconnected → `source: 'fallback'` with `warning` field
- `GET?limit=1000` → capped at 500
- `GET` with no limit param → defaults to 50

---

### `src/middleware/errorHandler.js` — 0% covered

Express error-handling middleware.

**Untested behaviours:**
- `err.status` takes precedence over `err.statusCode`
- Falls back to 500 when neither is set
- `console.error` is called for 5xx errors
- `console.error` is NOT called for 4xx errors

---

### `src/services/database.js` — 0% covered

SQL Server connection and query layer.

**Untested behaviours:**
- All 8 query parameters are bound for `insertTelemetryEvent`
- `source`, `event_type`, `device_id`, `session_id` are `null` when fields are missing from the event
- `payload` is JSON-serialised on insert and JSON-parsed on select
- `isConnected()` returns false before `connect()` and after `close()`

---

### `src/config.js` — 0% covered

Environment-variable parsing and defaults.

**Untested behaviours:**
- `PORT` not set → defaults to `3000`
- `POLL_INTERVAL_MS` not set → defaults to `5000`
- `DB_ENCRYPT=false` → `options.encrypt` is `false`
- `dbConfigured` is `false` when any of the four required DB vars is missing
- `optionalEnv` returns `null` (not `undefined`) for unset vars

---

### `src/server.js` — 0% covered

Express app setup.

**Untested behaviours:**
- `GET /health` returns correct status structure
- `GET /health` reflects DB connection state
- Request body size capped at 1 MB
- Error handler middleware is wired in

---

### `public/app.js` — 0% covered

AngularJS frontend controller.

**Untested behaviours:**
- Form validation (eventType required before submit)
- Extra JSON merged into submission payload
- Error handling on failed POST
- Auto-refresh intervals for health and events panels
