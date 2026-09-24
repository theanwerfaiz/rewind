import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { generateTest } from "@/lib/test-generator";
import type { RewindEvent } from "@/lib/mock-events";

type EventRow = {
  id: string;
  timestamp: string;
  type: RewindEvent["type"];
  title: string;
  status: RewindEvent["status"];
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const eventId = body.eventId;

    const framework = body.framework === "vitest" ? "vitest" : "playwright";

    if (typeof eventId !== "string" || eventId.length === 0) {
      return NextResponse.json(
        {
          error: "eventId is required",
        },
        {
          status: 400,
        },
      );
    }

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
      .get(eventId) as EventRow | undefined;

    if (!row) {
      return NextResponse.json(
        {
          error: "Event not found",
        },
        {
          status: 404,
        },
      );
    }

    if (row.type !== "http.request") {
      return NextResponse.json(
        {
          error:
            "Tests can currently only be generated from http.request events.",
        },
        {
          status: 400,
        },
      );
    }

    const event: RewindEvent = {
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

      metadata: parseJson(row.metadata) as Record<string, unknown> | undefined,

      payload: parseJson(row.payload),

      createdAt: row.created_at,
    };

    const code = generateTest({
      event,
      framework,
    });

    return NextResponse.json({
      success: true,
      framework,
      filename:
        framework === "playwright"
          ? "rewind-regression.spec.ts"
          : "rewind-regression.test.ts",
      code,
    });
  } catch (error) {
    console.error("Test generation failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Test generation failed",
      },
      {
        status: 500,
      },
    );
  }
}
