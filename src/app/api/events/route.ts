import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/request-body";
import db from "@/lib/db";
import { recordParentEdge } from "@/lib/event-edges";
import { recordExecutionEvent } from "@/lib/executions";
import { assignExecutionFingerprint } from "@/lib/fingerprints";
import { applyIngestRedaction } from "@/lib/settings";

export const runtime = "nodejs";

type EventStatus = "success" | "error" | "neutral";

type CreateEventInput = {
  id?: unknown;
  timestamp?: unknown;
  type: string;
  title: string;
  status?: EventStatus;
  duration?: string;
  source?: string;
  traceId?: string;
  spanId?: string;
  requestId?: string;
  sessionId?: string;
  userId?: string;
  executionId?: string;
  parentEventId?: string;
  metadata?: Record<string, unknown>;
  payload?: unknown;
};

/** A row of the events table, as SQLite returns it. */
type EventRow = {
  id: string;
  timestamp: string;
  type: string;
  title: string;
  status: string;
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

function serializeEvent(row: EventRow) {
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
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    payload: row.payload ? JSON.parse(row.payload) : undefined,
    createdAt: row.created_at,
  };
}

function toOptionalId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_-]{1,128}$/;

function toTimestamp(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const time = Date.parse(value);

  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function isDuplicateKeyError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "SQLITE_CONSTRAINT_PRIMARYKEY"
  );
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const search = searchParams.get("search")?.trim() ?? "";

    const type = searchParams.get("type")?.trim() ?? "";

    const requestedLimit = Number(searchParams.get("limit") ?? "100");

    const limit = Math.min(
      Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 100, 1),
      500,
    );

    let rows: EventRow[];

    if (search && type) {
      rows = db
        .prepare(
          `
          SELECT *
          FROM events
          WHERE
            type = ?
            AND (
              title LIKE ?
              OR id LIKE ?
              OR request_id LIKE ?
              OR trace_id LIKE ?
              OR span_id LIKE ?
              OR session_id LIKE ?
              OR user_id LIKE ?
              OR execution_id LIKE ?
            )
          ORDER BY timestamp DESC
          LIMIT ?
        `,
        )
        .all(
          type,
          ...Array(8).fill(`%${search}%`),
          limit,
        ) as EventRow[];
    } else if (search) {
      rows = db
        .prepare(
          `
          SELECT *
          FROM events
          WHERE
            title LIKE ?
            OR id LIKE ?
            OR type LIKE ?
            OR request_id LIKE ?
            OR trace_id LIKE ?
            OR span_id LIKE ?
            OR session_id LIKE ?
            OR user_id LIKE ?
            OR execution_id LIKE ?
          ORDER BY timestamp DESC
          LIMIT ?
        `,
        )
        .all(
          ...Array(9).fill(`%${search}%`),
          limit,
        ) as EventRow[];
    } else if (type) {
      rows = db
        .prepare(
          `
          SELECT *
          FROM events
          WHERE type = ?
          ORDER BY timestamp DESC
          LIMIT ?
        `,
        )
        .all(type, limit) as EventRow[];
    } else {
      rows = db
        .prepare(
          `
          SELECT *
          FROM events
          ORDER BY timestamp DESC
          LIMIT ?
        `,
        )
        .all(limit) as EventRow[];
    }

    return NextResponse.json({
      events: rows.map(serializeEvent),
      count: rows.length,
    });
  } catch (error) {
    console.error("Failed to fetch events:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch events",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = await readJsonObject(request);

    if (!parsed) {
      return NextResponse.json(
        {
          error: "Request body must be a JSON object.",
        },
        {
          status: 400,
        },
      );
    }

    const body = parsed as CreateEventInput;

    if (!body.type || typeof body.type !== "string") {
      return NextResponse.json(
        {
          error: "Event type is required",
        },
        {
          status: 400,
        },
      );
    }

    if (!body.title || typeof body.title !== "string") {
      return NextResponse.json(
        {
          error: "Event title is required",
        },
        {
          status: 400,
        },
      );
    }

    if (
      body.id !== undefined &&
      !(typeof body.id === "string" && EVENT_ID_PATTERN.test(body.id))
    ) {
      return NextResponse.json(
        {
          error: "Event id must match evt_[A-Za-z0-9_-]",
        },
        {
          status: 400,
        },
      );
    }

    // Capture clients may pre-assign the ID so child events can reference
    // their parent before the parent itself is stored.
    const id =
      typeof body.id === "string" ? body.id : `evt_${crypto.randomUUID()}`;

    const timestamp = toTimestamp(body.timestamp) ?? new Date().toISOString();

    const createdAt = new Date().toISOString();

    const status = body.status ?? "neutral";

    const insert = db.prepare(`
      INSERT INTO events (
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
      )
      VALUES (
        @id,
        @timestamp,
        @type,
        @title,
        @status,
        @duration,
        @source,
        @trace_id,
        @span_id,
        @request_id,
        @session_id,
        @user_id,
        @execution_id,
        @parent_event_id,
        @metadata,
        @payload,
        @created_at
      )
    `);

    const executionId = toOptionalId(body.executionId);

    const parentEventId = toOptionalId(body.parentEventId);

    const traceId = toOptionalId(body.traceId);

    const duration = body.duration ?? null;

    const environment =
      typeof body.metadata?.environment === "string"
        ? body.metadata.environment
        : null;

    // Workspace redaction rules, on top of what the capture client did.
    const redacted = applyIngestRedaction({
      metadata: body.metadata,
      payload: body.payload,
    });

    const row = {
      id,
      timestamp,
      type: body.type,
      title: body.title,
      status,
      duration,
      source: body.source ?? null,
      trace_id: traceId,
      span_id: toOptionalId(body.spanId),
      request_id: toOptionalId(body.requestId),
      session_id: toOptionalId(body.sessionId),
      user_id: toOptionalId(body.userId),
      execution_id: executionId,
      parent_event_id: parentEventId,
      metadata: redacted.metadata ? JSON.stringify(redacted.metadata) : null,
      payload:
        redacted.payload !== undefined ? JSON.stringify(redacted.payload) : null,
      created_at: createdAt,
    };

    try {
      db.transaction(() => {
        insert.run(row);

        if (executionId) {
          recordExecutionEvent({
            id,
            executionId,
            parentEventId,
            timestamp,
            duration,
            status,
            traceId,
            environment,
          });
        }

        if (parentEventId) {
          recordParentEdge({
            executionId,
            parentEventId,
            childEventId: id,
            createdAt,
          });
        }

        if (executionId) {
          assignExecutionFingerprint(executionId);
        }
      })();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return NextResponse.json(
          {
            error: "Event already exists",
          },
          {
            status: 409,
          },
        );
      }

      throw error;
    }

    const created = db
      .prepare(
        `
          SELECT *
          FROM events
          WHERE id = ?
        `,
      )
      .get(id) as EventRow;

    return NextResponse.json(
      {
        event: serializeEvent(created),
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error("Failed to create event:", error);

    return NextResponse.json(
      {
        error: "Failed to create event",
      },
      {
        status: 500,
      },
    );
  }
}
