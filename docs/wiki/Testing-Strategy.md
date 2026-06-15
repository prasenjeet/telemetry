# Testing Strategy

## Recommended Stack

```bash
npm install --save-dev jest supertest
```

Add to `package.json`:

```json
"scripts": {
  "test": "jest",
  "test:coverage": "jest --coverage"
}
```

Jest is the right choice here: it ships with mocking, assertions, and coverage reporting (via Istanbul/V8) in a single package. `supertest` enables HTTP-layer testing of the Express app without starting a real server.

---

## Priority 1 — `fileStore.js` (durability layer)

Test against a real temporary directory (`fs.mkdtempSync`) — no mocking needed. These are the highest-value tests because bugs here silently lose events in production.

```js
// tests/services/fileStore.test.js
const os = require('os');
const fs = require('fs');
const path = require('path');
const fileStore = require('../../src/services/fileStore');

let tmpDir, config;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-'));
  config = { dataDir: tmpDir };
  fileStore.ensureDirectories(config);
});

afterEach(() => fs.rmSync(tmpDir, { recursive: true }));

test('writePending creates a .json file with sanitised timestamp', async () => {
  const event = { id: 'abc-123', receivedAt: new Date().toISOString(), payload: {} };
  const filePath = await fileStore.writePending(event, config);
  expect(filePath).toMatch(/\.json$/);
  expect(path.basename(filePath)).not.toMatch(/[:.]/); // colons replaced
  const written = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  expect(written.id).toBe('abc-123');
});

test('listPending excludes .error sidecar files', async () => {
  const event = { id: 'x', payload: {} };
  const fp = await fileStore.writePending(event, config);
  fs.writeFileSync(fp + '.error', '{}'); // create sidecar
  const list = await fileStore.listPending(config);
  expect(list).toHaveLength(1);
  expect(list[0]).toBe(fp);
});

test('markFailed increments attempt count across calls', async () => {
  const event = { id: 'y', payload: {} };
  const fp = await fileStore.writePending(event, config);
  await fileStore.markFailed(fp, 'reason 1');
  await fileStore.markFailed(fp, 'reason 2');
  expect(await fileStore.getAttempts(fp)).toBe(2);
});

test('getAttempts returns 0 when no .error file exists', async () => {
  const event = { id: 'z', payload: {} };
  const fp = await fileStore.writePending(event, config);
  expect(await fileStore.getAttempts(fp)).toBe(0);
});

test('markProcessed moves file and removes sidecar', async () => {
  const event = { id: 'p', payload: {} };
  const fp = await fileStore.writePending(event, config);
  fs.writeFileSync(fp + '.error', '{}');
  await fileStore.markProcessed(fp, config);
  expect(fs.existsSync(fp)).toBe(false);         // original gone
  expect(fs.existsSync(fp + '.error')).toBe(false); // sidecar gone
});

test('readPendingFiles skips malformed JSON silently', async () => {
  const dir = path.join(tmpDir, 'pending');
  fs.writeFileSync(path.join(dir, '2024-01-01_bad.json'), 'not-json');
  const events = await fileStore.readPendingFiles(config, 10);
  expect(events).toEqual([]);
});
```

---

## Priority 1 — `processor.js` (batch worker)

Use Jest's mock functions for `db` and `fileStore` — the processor already accepts them as arguments, so no module-level mocking is needed.

```js
// tests/services/processor.test.js
const { processOneBatch, start, stop } = require('../../src/services/processor');

const config = { pollIntervalMs: 100 };

function makeDb(connected = true) {
  return {
    isConnected: jest.fn().mockReturnValue(connected),
    insertTelemetryEvent: jest.fn().mockResolvedValue(),
  };
}

function makeFileStore(files = [], event = { id: 'evt-1', payload: {} }) {
  return {
    listPending: jest.fn().mockResolvedValue(files),
    getAttempts: jest.fn().mockResolvedValue(0),
    readEvent: jest.fn().mockResolvedValue(event),
    markProcessed: jest.fn().mockResolvedValue(),
    markFailed: jest.fn().mockResolvedValue(1),
  };
}

test('skips batch when DB is not connected', async () => {
  const db = makeDb(false);
  const fs = makeFileStore(['/tmp/a.json']);
  await processOneBatch(config, db, fs);
  expect(fs.listPending).not.toHaveBeenCalled();
});

test('calls markProcessed on successful insert', async () => {
  const db = makeDb();
  const fs = makeFileStore(['/tmp/a.json']);
  await processOneBatch(config, db, fs);
  expect(db.insertTelemetryEvent).toHaveBeenCalledTimes(1);
  expect(fs.markProcessed).toHaveBeenCalledWith('/tmp/a.json', config);
});

test('calls markFailed when insert throws', async () => {
  const db = makeDb();
  db.insertTelemetryEvent.mockRejectedValue(new Error('DB down'));
  const fs = makeFileStore(['/tmp/a.json']);
  await processOneBatch(config, db, fs);
  expect(fs.markFailed).toHaveBeenCalledWith('/tmp/a.json', 'DB down');
});

test('skips poison-pill files (attempts >= 3)', async () => {
  const db = makeDb();
  const fs = makeFileStore(['/tmp/a.json']);
  fs.getAttempts.mockResolvedValue(3);
  await processOneBatch(config, db, fs);
  expect(fs.readEvent).not.toHaveBeenCalled();
});

test('stop() clears the interval timer', () => {
  const db = makeDb();
  const fs = makeFileStore();
  start(config, db, fs);
  stop();
  // No assertion needed — if stop() throws or hangs the test fails
});
```

---

## Priority 2 — `routes/telemetry.js` (API contract)

Use `supertest` against the Express app. Mock `fileStore` and `db` at the module level.

```js
// tests/routes/telemetry.test.js
const request = require('supertest');
const app = require('../../src/server');

jest.mock('../../src/services/fileStore', () => ({
  writePending: jest.fn().mockResolvedValue('/tmp/fake.json'),
  readPendingFiles: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../src/services/database', () => ({
  isConnected: jest.fn().mockReturnValue(false),
  getRecentEvents: jest.fn().mockResolvedValue([]),
}));

const fileStore = require('../../src/services/fileStore');
const db = require('../../src/services/database');

test('POST valid object → 202 with id and status', async () => {
  const res = await request(app)
    .post('/api/telemetry')
    .send({ eventType: 'click' });
  expect(res.status).toBe(202);
  expect(res.body.status).toBe('queued');
  expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
});

test('POST array body → 400', async () => {
  const res = await request(app)
    .post('/api/telemetry')
    .send([{ eventType: 'click' }]);
  expect(res.status).toBe(400);
});

test('POST null body → 400', async () => {
  const res = await request(app)
    .post('/api/telemetry')
    .set('Content-Type', 'application/json')
    .send('null');
  expect(res.status).toBe(400);
});

test('GET when DB disconnected → source: fallback with warning', async () => {
  db.isConnected.mockReturnValue(false);
  const res = await request(app).get('/api/telemetry');
  expect(res.status).toBe(200);
  expect(res.body.source).toBe('fallback');
  expect(res.body.warning).toBeDefined();
});

test('GET when DB connected → source: database', async () => {
  db.isConnected.mockReturnValue(true);
  const res = await request(app).get('/api/telemetry');
  expect(res.body.source).toBe('database');
});

test('GET?limit=1000 is capped at 500', async () => {
  db.isConnected.mockReturnValue(true);
  await request(app).get('/api/telemetry?limit=1000');
  expect(db.getRecentEvents).toHaveBeenCalledWith(500);
});

test('GET with no limit defaults to 50', async () => {
  db.isConnected.mockReturnValue(true);
  await request(app).get('/api/telemetry');
  expect(db.getRecentEvents).toHaveBeenCalledWith(50);
});
```

---

## Priority 3 — `errorHandler.js`

```js
// tests/middleware/errorHandler.test.js
const errorHandler = require('../../src/middleware/errorHandler');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

test('uses err.status when present', () => {
  const res = makeRes();
  errorHandler({ status: 422, message: 'bad' }, {}, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(422);
});

test('falls back to err.statusCode', () => {
  const res = makeRes();
  errorHandler({ statusCode: 404, message: 'not found' }, {}, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(404);
});

test('defaults to 500 when no status set', () => {
  const res = makeRes();
  errorHandler(new Error('boom'), { method: 'GET', path: '/' }, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(500);
});
```

---

## Priority 4 — `config.js`

Config is loaded at `require()` time, so each test must reset the module registry and manipulate `process.env` before importing.

```js
// tests/config.test.js
afterEach(() => {
  jest.resetModules();
  // restore env
});

test('PORT defaults to 3000', () => {
  delete process.env.PORT;
  const config = require('../../src/config');
  expect(config.port).toBe(3000);
});

test('dbConfigured is false when any DB var is missing', () => {
  process.env.DB_SERVER = 'host';
  // DB_NAME, DB_USER, DB_PASSWORD not set
  const config = require('../../src/config');
  expect(config.dbConfigured).toBe(false);
});

test('DB_ENCRYPT=false sets options.encrypt to false', () => {
  process.env.DB_ENCRYPT = 'false';
  const config = require('../../src/config');
  expect(config.db.options.encrypt).toBe(false);
});
```

---

## Coverage Targets

| Module | Target |
|--------|--------|
| `fileStore.js` | 90%+ |
| `processor.js` | 90%+ |
| `routes/telemetry.js` | 85%+ |
| `errorHandler.js` | 100% |
| `config.js` | 80%+ |
| `database.js` | 70%+ (integration tests optional) |
