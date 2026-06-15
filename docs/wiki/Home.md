# Telemetry Service — Wiki

Welcome to the telemetry service documentation.

## Pages

| Page | Description |
|------|-------------|
| [Test Coverage Analysis](Test-Coverage-Analysis) | Current state of test coverage across all modules |
| [Testing Strategy](Testing-Strategy) | Prioritized recommendations and concrete test cases |

## Project Overview

This service accepts telemetry events via a REST API, buffers them to flat files for durability, and asynchronously ingests them into a SQL Server database. A background processor retries failed inserts up to three times before marking an event as a poison-pill.

### Architecture

```
HTTP Client
    │
    ▼
POST /api/telemetry          ← routes/telemetry.js
    │
    ▼
Flat-file buffer (pending/)  ← services/fileStore.js
    │
    ▼  (polled every N seconds)
Background Processor         ← services/processor.js
    │
    ▼
SQL Server DB                ← services/database.js
```

### Key Design Properties

- **Durability first**: events are written to disk before the API returns 202, so no event is lost even if the database is down.
- **At-least-once delivery**: the processor retries up to 3 times per file.
- **Poison-pill protection**: files that fail 3 times are left in place for manual inspection rather than silently dropped.
- **Graceful degradation**: `GET /api/telemetry` falls back to reading flat files when the database is unreachable.
