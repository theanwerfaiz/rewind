import db from "@/lib/db";
import { getEventsByExecutionId, parseDurationMs } from "@/lib/events";
import type { EventStatus, RewindEvent } from "./mock-events";

export type ExecutionStatus = "success" | "error";

export type RewindExecution = {
  id: string;
  startedAt: string;
  endedAt: string;
  status: ExecutionStatus;
  traceId: string | null;
  rootEventId: string | null;
  environment: string | null;
  eventCount: number;
  createdAt: string;
  updatedAt: string;
};

type ExecutionRow = {
  id: string;
  started_at: string;
  ended_at: string;
  status: ExecutionStatus;
  trace_id: string | null;
  root_event_id: string | null;
  environment: string | null;
  event_count: number;
  created_at: string;
  updated_at: string;
};

export type ExecutionEventInput = {
  id: string;
  executionId: string;
  parentEventId: string | null;
  timestamp: string;
  duration: string | null;
  status: EventStatus;
  traceId: string | null;
  environment: string | null;
};

function mapExecution(row: ExecutionRow): RewindExecution {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
    traceId: row.trace_id,
    rootEventId: row.root_event_id,
    environment: row.environment,
    eventCount: row.event_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getEventEnd(timestamp: string, duration: string | null) {
  const durationMs = parseDurationMs(duration);

  if (durationMs === null) {
    return timestamp;
  }

  return new Date(Date.parse(timestamp) + durationMs).toISOString();
}

/**
 * Creates the execution on its first event and folds every later event into
 * it. Call inside the same transaction that inserts the event.
 *
 * - startedAt / endedAt span the earliest start and latest end of its events
 * - status becomes "error" as soon as any event errors
 * - the first event without a parent becomes the root event
 */
export function recordExecutionEvent(event: ExecutionEventInput) {
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO executions (
      id,
      started_at,
      ended_at,
      status,
      trace_id,
      root_event_id,
      environment,
      event_count,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @started_at,
      @ended_at,
      @status,
      @trace_id,
      @root_event_id,
      @environment,
      1,
      @now,
      @now
    )
    ON CONFLICT(id) DO UPDATE SET
      started_at = MIN(executions.started_at, excluded.started_at),
      ended_at = MAX(executions.ended_at, excluded.ended_at),
      status = CASE
        WHEN executions.status = 'error' OR excluded.status = 'error'
          THEN 'error'
        ELSE executions.status
      END,
      trace_id = COALESCE(executions.trace_id, excluded.trace_id),
      root_event_id = COALESCE(
        executions.root_event_id,
        excluded.root_event_id
      ),
      environment = COALESCE(executions.environment, excluded.environment),
      event_count = executions.event_count + 1,
      updated_at = excluded.updated_at
    `,
  ).run({
    id: event.executionId,
    started_at: event.timestamp,
    ended_at: getEventEnd(event.timestamp, event.duration),
    status: event.status === "error" ? "error" : "success",
    trace_id: event.traceId,
    root_event_id: event.parentEventId === null ? event.id : null,
    environment: event.environment,
    now,
  });
}

export function getExecutions(limit = 100): RewindExecution[] {
  const rows = db
    .prepare(
      `
      SELECT *
      FROM executions
      ORDER BY started_at DESC
      LIMIT ?
      `,
    )
    .all(limit) as ExecutionRow[];

  return rows.map(mapExecution);
}

export function getExecutionById(id: string): {
  execution: RewindExecution;
  events: RewindEvent[];
} | null {
  const row = db
    .prepare(
      `
      SELECT *
      FROM executions
      WHERE id = ?
      `,
    )
    .get(id) as ExecutionRow | undefined;

  if (!row) {
    return null;
  }

  return {
    execution: mapExecution(row),
    events: getEventsByExecutionId(id),
  };
}
