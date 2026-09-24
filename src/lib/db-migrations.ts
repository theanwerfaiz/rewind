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

      CREATE TABLE IF NOT EXISTS event_edges (
        id TEXT PRIMARY KEY,
        execution_id TEXT,
        from_event_id TEXT NOT NULL,
        to_event_id TEXT NOT NULL,
        type TEXT NOT NULL,
        origin TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,

        UNIQUE (from_event_id, to_event_id, type)
      );

      CREATE INDEX IF NOT EXISTS idx_event_edges_execution_id
        ON event_edges(execution_id);

      CREATE INDEX IF NOT EXISTS idx_event_edges_from_event_id
        ON event_edges(from_event_id);

      CREATE INDEX IF NOT EXISTS idx_event_edges_to_event_id
        ON event_edges(to_event_id);

      -- Backfill explicit parent edges for events captured before edges
      -- were stored. INSERT OR IGNORE keeps this idempotent.
      INSERT OR IGNORE INTO event_edges (
        id,
        execution_id,
        from_event_id,
        to_event_id,
        type,
        origin,
        confidence,
        created_at
      )
      SELECT
        'edg_' || lower(hex(randomblob(16))),
        execution_id,
        parent_event_id,
        id,
        'parent_of',
        'explicit',
        1,
        created_at
      FROM events
      WHERE parent_event_id IS NOT NULL;
    `);
  })();
}
