# Telemetry API

A Node.js REST API that ingests telemetry events using a **flat-file write-ahead buffer** before persisting them to MS SQL Server.

## Architecture

```
Client
  │
  ▼  POST /api/telemetry
  │
  ├─► Express API ──► writes JSON to data/pending/   (instant, durable)
  │
  └─► Background Processor (polls every 5s)
        ├─► reads data/pending/*.json
        ├─► INSERT INTO telemetry_events (MS SQL)
        └─► moves file to data/processed/YYYY-MM-DD/
            (or retries on failure — max 3 attempts)
```

**Why flat files first?** The API returns 202 immediately after writing to disk. Even during a DB outage, all events are safely buffered. The processor drains the buffer automatically once the DB recovers. No events are lost.

## Prerequisites

- Node.js 18+
- MS SQL Server 2016+ (or Azure SQL)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your DB credentials

# 3. Create the database table (run once)
# Connect to your SQL Server and execute:
# sql/schema.sql

# 4. Start the server
npm start

# Development (auto-restart on changes)
npm run dev
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | `development` | Environment name |
| `DB_SERVER` | *(required)* | SQL Server hostname |
| `DB_PORT` | `1433` | SQL Server port |
| `DB_NAME` | *(required)* | Database name |
| `DB_USER` | *(required)* | Login username |
| `DB_PASSWORD` | *(required)* | Login password |
| `DB_ENCRYPT` | `false` | Encrypt connection (set `true` in production) |
| `DB_TRUST_SERVER_CERT` | `true` | Trust self-signed cert (set `false` in production) |
| `POLL_INTERVAL_MS` | `5000` | How often the processor checks for pending files |
| `DATA_DIR` | `./data` | Root directory for pending/processed files |

## API Reference

### `POST /api/telemetry`

Accepts a telemetry event and immediately buffers it to a flat file.

**Request body** — any JSON object:
```json
{
  "eventType": "page_view",
  "deviceId": "dev-001",
  "sessionId": "sess-abc",
  "page": "/home"
}
```

**Response** — `202 Accepted`:
```json
{ "id": "a3f1b2c4-...", "status": "queued" }
```

```bash
curl -X POST http://localhost:3000/api/telemetry \
  -H "Content-Type: application/json" \
  -d '{"eventType":"page_view","deviceId":"dev-001","page":"/home"}'
```

---

### `GET /api/telemetry?limit=50`

Returns recent telemetry events. Queries the database when connected; falls back to buffered flat files when the DB is unavailable.

**Query params:**
- `limit` — number of events to return (default `50`, max `500`)

**Response:**
```json
{
  "events": [...],
  "count": 12,
  "source": "database",
  "limit": 50
}
```

When the DB is unavailable, `source` will be `"fallback"` and a `warning` field is included.

```bash
curl http://localhost:3000/api/telemetry?limit=10
```

---

### `GET /health`

Returns server health status. Always returns `200` — the API is healthy even when the DB is disconnected (it still buffers to flat files).

```json
{
  "status": "ok",
  "timestamp": "2026-05-08T17:48:00.000Z",
  "db": "connected",
  "uptime": 42
}
```

---

## Data Directory

```
data/
├── pending/          — unprocessed events (written by API, read by processor)
└── processed/
    └── 2026-05-08/   — date-bucketed, successfully inserted events
```

Files named: `<ISO-timestamp>_<uuid>.json`

A `.error` sidecar file is written alongside events that fail DB insertion. After 3 failures the event is skipped (kept on disk for manual inspection).

## Running the Processor Standalone

```bash
node src/services/processor.js
```

Useful when you want to run the API server and processor as separate processes (e.g., different containers). Both can share the same `data/` directory on a shared volume.

## Production Notes

- Set `DB_ENCRYPT=true` and `DB_TRUST_SERVER_CERT=false` for production SQL Server connections.
- Monitor `data/pending/` file count — accumulation indicates the processor is falling behind.
- `data/` is excluded from git. Ensure it is on a persistent volume in containerised deployments.
- A single Node.js process handles both the API and processor. For horizontal scaling, run only the API on multiple instances and a **single** processor instance to avoid concurrent writes to the same SQL rows.
