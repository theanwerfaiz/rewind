import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/lib/db-migrations";

let database: Database.Database | undefined;

afterEach(() => {
  database?.close();
  database = undefined;
});

function createLegacyDatabase() {
  const legacy = new Database(":memory:");

  legacy.exec(`
    CREATE TABLE events (
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
  `);

  legacy
    .prepare(
      `
      INSERT INTO events (
        id, timestamp, type, title, status, trace_id, request_id,
        session_id, user_id, metadata, payload, created_at
      )
      VALUES (
        'evt_legacy', '2026-09-01T00:00:00.000Z', 'http.request',
        'GET /legacy', 'success', 'trace_legacy', 'req_legacy',
        'sess_legacy', 'user_legacy', '{"method":"GET"}', '{"a":1}',
        '2026-09-01T00:00:00.000Z'
      )
      `,
    )
    .run();

  return legacy;
}

function columnNames(db: Database.Database) {
  return (
    db.prepare(`PRAGMA table_info(events)`).all() as { name: string }[]
  ).map((column) => column.name);
}

function indexNames(db: Database.Database) {
  return (
    db.prepare(`PRAGMA index_list(events)`).all() as { name: string }[]
  ).map((index) => index.name);
}

describe("migrateDatabase", () => {
  it("adds span_id to a legacy events table without losing data", () => {
    database = createLegacyDatabase();

    expect(columnNames(database)).not.toContain("span_id");

    migrateDatabase(database);

    expect(columnNames(database)).toContain("span_id");

    const row = database
      .prepare(`SELECT * FROM events WHERE id = 'evt_legacy'`)
      .get() as Record<string, unknown>;

    expect(row).toMatchObject({
      id: "evt_legacy",
      title: "GET /legacy",
      trace_id: "trace_legacy",
      span_id: null,
      request_id: "req_legacy",
      session_id: "sess_legacy",
      user_id: "user_legacy",
      metadata: '{"method":"GET"}',
      payload: '{"a":1}',
    });
  });

  it("adds execution identity columns and the executions table", () => {
    database = createLegacyDatabase();

    migrateDatabase(database);

    expect(columnNames(database)).toEqual(
      expect.arrayContaining(["execution_id", "parent_event_id"]),
    );

    const row = database
      .prepare(`SELECT execution_id, parent_event_id FROM events`)
      .get();

    expect(row).toEqual({
      execution_id: null,
      parent_event_id: null,
    });

    const executionColumns = (
      database.prepare(`PRAGMA table_info(executions)`).all() as {
        name: string;
      }[]
    ).map((column) => column.name);

    expect(executionColumns).toEqual(
      expect.arrayContaining([
        "id",
        "started_at",
        "ended_at",
        "status",
        "trace_id",
        "root_event_id",
        "environment",
        "event_count",
      ]),
    );
  });

  it("backfills parent edges idempotently", () => {
    database = createLegacyDatabase();

    migrateDatabase(database);

    database
      .prepare(
        `
        INSERT INTO events (
          id, timestamp, type, title, status, execution_id,
          parent_event_id, created_at
        )
        VALUES (
          'evt_child', '2026-09-01T00:00:01.000Z', 'database.query',
          'SELECT 1', 'success', 'exe_legacy', 'evt_legacy',
          '2026-09-01T00:00:01.000Z'
        )
        `,
      )
      .run();

    migrateDatabase(database);
    migrateDatabase(database);

    const edges = database
      .prepare(
        `SELECT execution_id, from_event_id, to_event_id, type, origin
         FROM event_edges`,
      )
      .all();

    expect(edges).toEqual([
      {
        execution_id: "exe_legacy",
        from_event_id: "evt_legacy",
        to_event_id: "evt_child",
        type: "parent_of",
        origin: "explicit",
      },
    ]);
  });

  it("adds failure fingerprint storage", () => {
    database = createLegacyDatabase();

    migrateDatabase(database);

    const executionColumns = (
      database.prepare(`PRAGMA table_info(executions)`).all() as {
        name: string;
      }[]
    ).map((column) => column.name);

    expect(executionColumns).toEqual(
      expect.arrayContaining(["fingerprint_id", "fingerprint_version"]),
    );

    const fingerprintColumns = (
      database.prepare(`PRAGMA table_info(failure_fingerprints)`).all() as {
        name: string;
      }[]
    ).map((column) => column.name);

    expect(fingerprintColumns).toEqual(
      expect.arrayContaining([
        "id",
        "version",
        "endpoint",
        "origin_type",
        "message",
        "status",
        "path",
      ]),
    );
  });

  it("adds experiment columns to an existing replays table", () => {
    database = createLegacyDatabase();

    database.exec(`
      CREATE TABLE replays (
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
        created_at TEXT NOT NULL
      );

      INSERT INTO replays (
        id, event_id, timestamp, method, url, status, duration, created_at
      )
      VALUES (
        'replay_legacy', 'evt_legacy', '2026-09-01T00:00:00.000Z', 'GET',
        'http://localhost:3000/legacy', 200, '5ms', '2026-09-01T00:00:00.000Z'
      );
    `);

    migrateDatabase(database);
    migrateDatabase(database);

    const replay = database
      .prepare(`SELECT * FROM replays WHERE id = 'replay_legacy'`)
      .get();

    expect(replay).toMatchObject({
      id: "replay_legacy",
      status: 200,
      label: null,
      mutations: null,
      source_execution_id: null,
      result_execution_id: null,
      dependency_mode: null,
    });

    const planColumns = (
      database.prepare(`PRAGMA table_info(replay_plans)`).all() as {
        name: string;
      }[]
    ).map((column) => column.name);

    expect(planColumns).toEqual([
      "replay_id",
      "mode",
      "fixtures",
      "dependency_mutations",
      "created_at",
    ]);
  });

  it("creates correlation indexes", () => {
    database = createLegacyDatabase();

    migrateDatabase(database);

    expect(indexNames(database)).toEqual(
      expect.arrayContaining([
        "idx_events_trace_id",
        "idx_events_span_id",
        "idx_events_session_id",
        "idx_events_execution_id",
        "idx_events_parent_event_id",
      ]),
    );
  });

  it("is idempotent", () => {
    database = createLegacyDatabase();

    migrateDatabase(database);

    expect(() => migrateDatabase(database!)).not.toThrow();

    expect(
      columnNames(database).filter((name) => name === "span_id"),
    ).toHaveLength(1);

    const count = database
      .prepare(`SELECT COUNT(*) as count FROM events`)
      .get() as { count: number };

    expect(count.count).toBe(1);
  });
});
