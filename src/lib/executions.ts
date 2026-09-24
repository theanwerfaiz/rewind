import db from "@/lib/db";
import { getEdgesForExecution } from "@/lib/event-edges";
import {
  buildExecutionGraph,
  type EventEdge,
  type ExecutionGraph,
} from "@/lib/event-graph";
import { getEventsByExecutionId, parseDurationMs } from "@/lib/events";
import type { EventStatus, EventType, RewindEvent } from "./mock-events";

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

  rootTitle: string | null;
  rootType: EventType | null;

  fingerprintId: string | null;
  /** Set when the execution was imported from a Reproduction Capsule. */
  capsuleId: string | null;
  /** The stored replay or experiment that produced this execution. */
  replayId: string | null;
  /** True for any execution produced by a Rewind replay. */
  isReplay: boolean;
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
  root_title: string | null;
  root_type: EventType | null;
  fingerprint_id: string | null;
  capsule_id: string | null;
  replay_id: string | null;
  is_replay: number;
};

/**
 * SQL condition that is true when the execution aliased as `alias` was
 * produced by a Rewind replay: a stored replay points at it, or its root
 * request carried Rewind's replay header (which also covers replays whose
 * record was never stored, e.g. when the target crashed mid-replay).
 */
export function isReplayExecutionSql(alias: string) {
  return `(
    EXISTS (
      SELECT 1 FROM replays WHERE replays.result_execution_id = ${alias}.id
    )
    OR EXISTS (
      SELECT 1 FROM events AS replay_root
      WHERE replay_root.id = ${alias}.root_event_id
        AND json_valid(replay_root.metadata)
        AND json_extract(
          replay_root.metadata,
          '$.headers."x-rewind-replay-id"'
        ) IS NOT NULL
    )
  )`;
}

const EXECUTION_COLUMNS = `
  executions.*,
  root.title AS root_title,
  root.type AS root_type,
  (
    SELECT replays.id FROM replays
    WHERE replays.result_execution_id = executions.id
  ) AS replay_id,
  ${isReplayExecutionSql("executions")} AS is_replay
`;

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

    rootTitle: row.root_title,
    rootType: row.root_type,

    fingerprintId: row.fingerprint_id,
    capsuleId: row.capsule_id,
    replayId: row.replay_id,
    isReplay: row.is_replay === 1,
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
 * - status is the root event's outcome once the root is recorded: a child
 *   failure the application handled (a timed-out call it recovered from)
 *   stays visible in the graph but does not fail the execution. Before the
 *   root arrives (children are stored first), any error marks it failed
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
        WHEN executions.root_event_id IS NULL
          AND excluded.root_event_id IS NOT NULL
          THEN excluded.status
        WHEN executions.root_event_id IS NOT NULL
          THEN executions.status
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
      SELECT ${EXECUTION_COLUMNS}
      FROM executions
      LEFT JOIN events AS root
        ON root.id = executions.root_event_id
      ORDER BY executions.started_at DESC
      LIMIT ?
      `,
    )
    .all(limit) as ExecutionRow[];

  return rows.map(mapExecution);
}

export function getExecutionsByFingerprint(
  fingerprintId: string,
  limit = 100,
): RewindExecution[] {
  const rows = db
    .prepare(
      `
      SELECT ${EXECUTION_COLUMNS}
      FROM executions
      LEFT JOIN events AS root
        ON root.id = executions.root_event_id
      WHERE executions.fingerprint_id = ?
      ORDER BY executions.started_at DESC
      LIMIT ?
      `,
    )
    .all(fingerprintId, limit) as ExecutionRow[];

  return rows.map(mapExecution);
}

export function getExecutionById(id: string): {
  execution: RewindExecution;
  events: RewindEvent[];
  edges: EventEdge[];
} | null {
  const row = db
    .prepare(
      `
      SELECT ${EXECUTION_COLUMNS}
      FROM executions
      LEFT JOIN events AS root
        ON root.id = executions.root_event_id
      WHERE executions.id = ?
      `,
    )
    .get(id) as ExecutionRow | undefined;

  if (!row) {
    return null;
  }

  return {
    execution: mapExecution(row),
    events: getEventsByExecutionId(id),
    edges: getEdgesForExecution(id),
  };
}

export function getExecutionGraphById(id: string): {
  execution: RewindExecution;
  events: RewindEvent[];
  edges: EventEdge[];
  graph: ExecutionGraph;
} | null {
  const result = getExecutionById(id);

  if (!result) {
    return null;
  }

  return {
    ...result,
    graph: buildExecutionGraph(result.events, result.edges),
  };
}
