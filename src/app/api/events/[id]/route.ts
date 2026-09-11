import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const { id } = await context.params;

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
          request_id,
          session_id,
          user_id,
          metadata,
          payload,
          created_at
        FROM events
        WHERE id = ?
        `,
      )
      .get(id) as
      | {
          id: string;
          timestamp: string;
          type: string;
          title: string;
          status: string;
          duration: string | null;
          source: string | null;
          trace_id: string | null;
          request_id: string | null;
          session_id: string | null;
          user_id: string | null;
          metadata: string | null;
          payload: string | null;
          created_at: string;
        }
      | undefined;

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

    return NextResponse.json({
      id: row.id,
      timestamp: row.timestamp,
      type: row.type,
      title: row.title,
      status: row.status,
      duration: row.duration,
      source: row.source,
      traceId: row.trace_id,
      requestId: row.request_id,
      sessionId: row.session_id,
      userId: row.user_id,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      payload: row.payload ? JSON.parse(row.payload) : null,
      createdAt: row.created_at,
    });
  } catch (error) {
    console.error("Failed to fetch event:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch event",
      },
      {
        status: 500,
      },
    );
  }
}
