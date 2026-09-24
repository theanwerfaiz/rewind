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
 * Migrations only ever add columns and indexes. Existing rows are preserved;
 * new columns are NULL for events captured before the migration.
 */
export function migrateDatabase(db: Database.Database) {
  db.transaction(() => {
    if (!hasColumn(db, "events", "span_id")) {
      db.exec(`ALTER TABLE events ADD COLUMN span_id TEXT`);
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_trace_id
        ON events(trace_id);

      CREATE INDEX IF NOT EXISTS idx_events_span_id
        ON events(span_id);

      CREATE INDEX IF NOT EXISTS idx_events_session_id
        ON events(session_id);
    `);
  })();
}
