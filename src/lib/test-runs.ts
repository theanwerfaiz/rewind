import db from "@/lib/db";
import type { TestRunResult } from "@/lib/test-runner";

export type StoredTestRun = {
  id: string;
  eventId: string;
  executionId: string | null;
  framework: string;
  success: boolean;
  exitCode: number;
  duration: string;
  createdAt: string;
};

type TestRunRow = {
  id: string;
  event_id: string;
  execution_id: string | null;
  framework: string;
  success: number;
  exit_code: number;
  duration: string;
  created_at: string;
};

/**
 * Records a generated test's result against the event (and execution) it
 * reproduces. Returns null when the event does not exist.
 */
export function recordTestRun(
  eventId: string,
  framework: string,
  result: TestRunResult,
): StoredTestRun | null {
  const event = db
    .prepare(`SELECT execution_id FROM events WHERE id = ?`)
    .get(eventId) as { execution_id: string | null } | undefined;

  if (!event) {
    return null;
  }

  const run: StoredTestRun = {
    id: `trun_${crypto.randomUUID()}`,
    eventId,
    executionId: event.execution_id,
    framework,
    success: result.success,
    exitCode: result.exitCode,
    duration: result.duration,
    createdAt: new Date().toISOString(),
  };

  db.prepare(
    `
    INSERT INTO test_runs (
      id, event_id, execution_id, framework, success, exit_code, duration,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    run.id,
    run.eventId,
    run.executionId,
    run.framework,
    run.success ? 1 : 0,
    run.exitCode,
    run.duration,
    run.createdAt,
  );

  return run;
}

export function getTestRunsForEvent(eventId: string, limit = 20) {
  return (
    db
      .prepare(
        `
        SELECT * FROM test_runs
        WHERE event_id = ?
        ORDER BY created_at DESC
        LIMIT ?
        `,
      )
      .all(eventId, limit) as TestRunRow[]
  ).map(
    (row): StoredTestRun => ({
      id: row.id,
      eventId: row.event_id,
      executionId: row.execution_id,
      framework: row.framework,
      success: row.success === 1,
      exitCode: row.exit_code,
      duration: row.duration,
      createdAt: row.created_at,
    }),
  );
}
