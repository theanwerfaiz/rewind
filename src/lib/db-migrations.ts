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
  // IMMEDIATE takes the write lock up front. Several processes (e.g. parallel
  // `next build` workers) run this at startup; a deferred transaction that
  // upgrades from read to write fails with SQLITE_BUSY instead of waiting.
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

      CREATE TABLE IF NOT EXISTS failure_fingerprints (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        endpoint TEXT NOT NULL,
        origin_type TEXT NOT NULL,
        message TEXT NOT NULL,
        status INTEGER,
        path TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

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

    if (!hasColumn(db, "executions", "fingerprint_id")) {
      db.exec(`ALTER TABLE executions ADD COLUMN fingerprint_id TEXT`);
    }

    if (!hasColumn(db, "executions", "fingerprint_version")) {
      db.exec(`ALTER TABLE executions ADD COLUMN fingerprint_version INTEGER`);
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_executions_fingerprint_id
        ON executions(fingerprint_id);
    `);

    // Replay Lab: experiments are replays with a label, explicit mutations,
    // and links to the source execution and the execution they produced.
    // The replays table is created in db.ts, so guard on its existence.
    const hasReplays = db
      .prepare(
        `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'replays'`,
      )
      .get();

    if (hasReplays) {
      for (const column of [
        "label",
        "mutations",
        "source_execution_id",
        "result_execution_id",
        "dependency_mode",
      ]) {
        if (!hasColumn(db, "replays", column)) {
          db.exec(`ALTER TABLE replays ADD COLUMN ${column} TEXT`);
        }
      }

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_replays_source_execution_id
          ON replays(source_execution_id);

        CREATE INDEX IF NOT EXISTS idx_replays_result_execution_id
          ON replays(result_execution_id);
      `);
    }

    // How dependency calls behave during a replay. Written before the
    // replayed request is sent and read by the target application.
    // Reproduction Capsules imported into this Rewind.
    if (!hasColumn(db, "executions", "capsule_id")) {
      db.exec(`ALTER TABLE executions ADD COLUMN capsule_id TEXT`);
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS capsule_imports (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        digest TEXT NOT NULL,
        capsule_created_at TEXT NOT NULL,
        imported_at TEXT NOT NULL
      );
    `);

    // An execution's status is its root event's outcome. Executions stored
    // before this rule, whose root succeeded after handling a child
    // failure, are corrected and lose the fingerprint they no longer have.
    db.exec(`
      UPDATE executions
      SET
        status = 'success',
        fingerprint_id = NULL,
        fingerprint_version = NULL
      WHERE status = 'error'
        AND EXISTS (
          SELECT 1 FROM events AS root
          WHERE root.id = executions.root_event_id
            AND root.status != 'error'
        );
    `);

    // Invariants: expected truths attached to an execution.
    db.exec(`
      CREATE TABLE IF NOT EXISTS invariants (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        definition TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_invariants_execution_id
        ON invariants(execution_id);
    `);

    // Verification runs: stored executions replayed against a candidate.
    db.exec(`
      CREATE TABLE IF NOT EXISTS verification_runs (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        code_version TEXT,
        target TEXT,
        total INTEGER NOT NULL,
        passed INTEGER NOT NULL,
        failed INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS verification_results (
        run_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        execution_id TEXT NOT NULL,
        capsule_id TEXT,
        title TEXT NOT NULL,
        expected_status TEXT,
        outcome TEXT,
        verdict TEXT NOT NULL,
        reason TEXT NOT NULL,
        replay_id TEXT,
        result_execution_id TEXT,

        PRIMARY KEY (run_id, position)
      );

      CREATE INDEX IF NOT EXISTS idx_verification_runs_created_at
        ON verification_runs(created_at);

      CREATE INDEX IF NOT EXISTS idx_verification_results_execution_id
        ON verification_results(execution_id);
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS replay_plans (
        replay_id TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        fixtures TEXT NOT NULL,
        dependency_mutations TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }).immediate();
}
