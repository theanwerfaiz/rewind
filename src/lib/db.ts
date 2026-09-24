import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

import { migrateDatabase } from "@/lib/db-migrations";

const dataDirectory = path.join(process.cwd(), "data");

if (!fs.existsSync(dataDirectory)) {
  fs.mkdirSync(dataDirectory, {
    recursive: true,
  });
}

const databasePath = path.join(dataDirectory, "rewind.db");

const globalForDatabase = globalThis as unknown as {
  rewindDatabase?: Database.Database;
};

export const db =
  globalForDatabase.rewindDatabase ?? new Database(databasePath);

if (process.env.NODE_ENV !== "test") {
  globalForDatabase.rewindDatabase = db;
}

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
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
    ON events(timestamp);

  CREATE INDEX IF NOT EXISTS idx_events_type
    ON events(type);

  CREATE INDEX IF NOT EXISTS idx_events_request_id
    ON events(request_id);

  CREATE INDEX IF NOT EXISTS idx_events_user_id
    ON events(user_id);

  CREATE TABLE IF NOT EXISTS replays (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    status INTEGER NOT NULL,
    duration TEXT NOT NULL,
    payload TEXT,
    response_body TEXT,
    response_headers TEXT,
    created_at TEXT NOT NULL,

    FOREIGN KEY (event_id)
      REFERENCES events(id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_replays_event_id
    ON replays(event_id);

  CREATE INDEX IF NOT EXISTS idx_replays_timestamp
    ON replays(timestamp);
`);

migrateDatabase(db);

export default db;
