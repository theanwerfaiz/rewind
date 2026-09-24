import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Same location as the app: REWIND_DB_PATH, or data/rewind.db.
const databasePath =
  process.env.REWIND_DB_PATH ?? path.join(process.cwd(), "data", "rewind.db");

const dataDirectory = path.dirname(databasePath);

if (!fs.existsSync(dataDirectory)) {
  fs.mkdirSync(dataDirectory, {
    recursive: true,
  });
}

const db = new Database(databasePath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'neutral',
    duration TEXT,
    source TEXT,
    trace_id TEXT,
    request_id TEXT,
    session_id TEXT,
    user_id TEXT,
    metadata TEXT,
    payload TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_events_timestamp
  ON events(timestamp DESC);

  CREATE INDEX IF NOT EXISTS idx_events_type
  ON events(type);

  CREATE INDEX IF NOT EXISTS idx_events_request_id
  ON events(request_id);

  CREATE INDEX IF NOT EXISTS idx_events_user_id
  ON events(user_id);
`);

const insert = db.prepare(`
  INSERT OR IGNORE INTO events (
    id,
    timestamp,
    type,
    title,
    status,
    duration,
    source,
    request_id,
    user_id,
    metadata,
    payload,
    created_at
  )
  VALUES (
    @id,
    @timestamp,
    @type,
    @title,
    @status,
    @duration,
    @source,
    @request_id,
    @user_id,
    @metadata,
    @payload,
    @created_at
  )
`);

const now = Date.now();

const events = [
  {
    id: "evt_demo_001",
    type: "webhook.received",
    title: "Stripe · checkout.session.completed",
    status: "success",
    duration: "324ms",
    source: "stripe",
    request_id: "req_82931",
    user_id: "user_123",
  },
  {
    id: "evt_demo_002",
    type: "http.request",
    title: "POST /api/checkout",
    status: "error",
    duration: "1.2s",
    source: "application",
    request_id: "req_82931",
    user_id: "user_123",
  },
  {
    id: "evt_demo_003",
    type: "error",
    title: "PaymentSessionError",
    status: "error",
    duration: undefined,
    source: "application",
    request_id: "req_82931",
    user_id: "user_123",
  },
  {
    id: "evt_demo_004",
    type: "database.query",
    title: "SELECT * FROM users WHERE id = …",
    status: "success",
    duration: "48ms",
    source: "postgres",
    request_id: "req_82931",
    user_id: "user_123",
  },
  {
    id: "evt_demo_005",
    type: "http.request",
    title: "GET /api/users/123",
    status: "success",
    duration: "120ms",
    source: "application",
    request_id: "req_82930",
    user_id: "user_123",
  },
  {
    id: "evt_demo_006",
    type: "command",
    title: "npm test",
    status: "success",
    duration: "12.4s",
    source: "terminal",
    request_id: undefined,
    user_id: undefined,
  },
  {
    id: "evt_demo_007",
    type: "deployment",
    title: "Deploy abc123",
    status: "neutral",
    duration: undefined,
    source: "github-actions",
    request_id: undefined,
    user_id: undefined,
  },
  {
    id: "evt_demo_008",
    type: "config.change",
    title: "Environment variable updated",
    status: "neutral",
    duration: undefined,
    source: "application",
    request_id: undefined,
    user_id: undefined,
  },
  {
    id: "evt_demo_009",
    type: "webhook.received",
    title: "GitHub · push",
    status: "success",
    duration: "210ms",
    source: "github",
    request_id: "req_82920",
    user_id: undefined,
  },
];

const transaction = db.transaction(() => {
  events.forEach((event, index) => {
    const timestamp = new Date(now - index * 45_000).toISOString();

    insert.run({
      id: event.id,
      timestamp,
      type: event.type,
      title: event.title,
      status: event.status,
      duration: event.duration ?? null,
      source: event.source ?? null,
      request_id: event.request_id ?? null,
      user_id: event.user_id ?? null,
      metadata: JSON.stringify({
        environment: "local",
        seeded: true,
      }),
      payload: JSON.stringify({
        demo: true,
      }),
      created_at: timestamp,
    });
  });
});

transaction();

console.log(`Seeded ${events.length} demo events into ${databasePath}`);

db.close();
