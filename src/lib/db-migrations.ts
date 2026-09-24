import type Database from "better-sqlite3";

type ColumnInfo = {
  name: string;
};

function hasColumn(db: Database.Database, table: string, column: string) {
  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as ColumnInfo[];

  return columns.some((info) => info.name === column);
}

/**
 * Applies additive, idempotent schema migrations.
 *
 * Migrations only ever add columns, tables and indexes. Existing rows are
 * preserved; new columns are NULL for events captured before the migration,
 * and those events do not belong to an execution.
 */
export function migrateDatabase(db: Database.Database) {
  db.transaction(() => {
    for (const column of ["span_id", "execution_id", "parent_event_id"]) {
      if (!hasColumn(db, "events", column)) {
        db.exec(`ALTER TABLE events ADD COLUMN ${column} TEXT`);
      }
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_trace_id
        ON events(trace_id);

      CREATE INDEX IF NOT EXISTS idx_events_span_id
        ON events(span_id);

      CREATE INDEX IF NOT EXISTS idx_events_session_id
        ON events(session_id);

      CREATE INDEX IF NOT EXISTS idx_events_execution_id
        ON events(execution_id);

      CREATE INDEX IF NOT EXISTS idx_events_parent_event_id
        ON events(parent_event_id);

      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        status TEXT NOT NULL,
        trace_id TEXT,
        root_event_id TEXT,
        environment TEXT,
        event_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_executions_started_at
        ON executions(started_at);

      CREATE INDEX IF NOT EXISTS idx_executions_trace_id
        ON executions(trace_id);
    `);
  })();
}
