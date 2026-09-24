import db from "@/lib/db";
import type { EventStatus, EventType, RewindEvent } from "./mock-events";

type EventRow = {
  id: string;
  timestamp: string;
  type: EventType;
  title: string;
  status: EventStatus;
  duration: string | null;
  source: string | null;
  trace_id: string | null;
  span_id: string | null;
  request_id: string | null;
  session_id: string | null;
  user_id: string | null;
  execution_id: string | null;
  parent_event_id: string | null;
  metadata: string | null;
  payload: string | null;
  created_at: string;
};

function parseJson(value: string | null) {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/**
 * Converts a stored duration such as "42ms" or "1.5s" to milliseconds.
 */
export function parseDurationMs(duration: string | null | undefined) {
  const match = duration?.match(/^([\d.]+)\s*(ms|s)$/i);

  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (!Number.isFinite(value)) {
    return null;
  }

  return unit === "s" ? value * 1000 : value;
}

function mapEvent(row: EventRow): RewindEvent {
  return {
    id: row.id,
    timestamp: row.timestamp,
    type: row.type,
    title: row.title,
    status: row.status,
    duration: row.duration,
    source: row.source,

    traceId: row.trace_id,
    spanId: row.span_id,
    requestId: row.request_id,
    sessionId: row.session_id,
    userId: row.user_id,

    executionId: row.execution_id,
    parentEventId: row.parent_event_id,

    metadata: parseJson(row.metadata),
    payload: parseJson(row.payload),

    createdAt: row.created_at,
  };
}

export function getEvents(): RewindEvent[] {
  const rows = db
    .prepare(
      `
      SELECT
        id,
        timestamp,
        type,
        title,
        status,
        duration,
        source,
        trace_id,
        span_id,
        request_id,
        session_id,
        user_id,
        execution_id,
        parent_event_id,
        metadata,
        payload,
        created_at
      FROM events
      ORDER BY timestamp DESC
      `,
    )
    .all() as EventRow[];

  return rows.map(mapEvent);
}

export function getEventById(id: string): RewindEvent | null {
  const row = db
    .prepare(
      `
      SELECT
        id,
        timestamp,
        type,
        title,
        status,
        duration,
        source,
        trace_id,
        span_id,
        request_id,
        session_id,
        user_id,
        execution_id,
        parent_event_id,
        metadata,
        payload,
        created_at
      FROM events
      WHERE id = ?
      `,
    )
    .get(id) as EventRow | undefined;

  if (!row) {
    return null;
  }

  return mapEvent(row);
}

export function getEventsByExecutionId(executionId: string): RewindEvent[] {
  const rows = db
    .prepare(
      `
      SELECT *
      FROM events
      WHERE execution_id = ?
      ORDER BY timestamp ASC, created_at ASC
      `,
    )
    .all(executionId) as EventRow[];

  return rows.map(mapEvent);
}

export function getEventStats() {
  const total = db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM events
      `,
    )
    .get() as {
    count: number;
  };

  const errors = db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM events
      WHERE status = 'error'
      `,
    )
    .get() as {
    count: number;
  };

  const webhooks = db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM events
      WHERE type = 'webhook.received'
      `,
    )
    .get() as {
    count: number;
  };

  const latencyRows = db
    .prepare(
      `
      SELECT duration
      FROM events
      WHERE type = 'http.request'
        AND duration IS NOT NULL
      `,
    )
    .all() as {
    duration: string;
  }[];

  const durations = latencyRows
    .map((row) => parseDurationMs(row.duration))
    .filter((value): value is number => value !== null);

  const averageLatency =
    durations.length > 0
      ? Math.round(
          durations.reduce((sum, value) => sum + value, 0) / durations.length,
        )
      : null;

  return {
    total: total.count,
    errors: errors.count,
    webhooks: webhooks.count,
    averageLatency,
  };
}
