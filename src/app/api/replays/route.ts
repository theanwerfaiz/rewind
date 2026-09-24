import { NextRequest, NextResponse } from "next/server";

import db from "@/lib/db";

export const runtime = "nodejs";

type ReplayRow = {
  id: string;
  event_id: string;
  timestamp: string;
  method: string;
  url: string;
  status: number;
  duration: string;
  payload: string | null;
  response_body: string | null;
  response_headers: string | null;
  created_at: string;
};

function parseJson(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function serializeReplay(row: ReplayRow) {
  return {
    id: row.id,

    eventId: row.event_id,

    timestamp: row.timestamp,

    method: row.method,

    url: row.url,

    status: row.status,

    duration: row.duration,

    payload: parseJson(row.payload),

    responseBody: parseJson(row.response_body),

    responseHeaders: parseJson(row.response_headers),

    createdAt: row.created_at,
  };
}

export async function GET(request: NextRequest) {
  try {
    const eventId = request.nextUrl.searchParams.get("eventId");

    const limitParam = request.nextUrl.searchParams.get("limit");

    const parsedLimit = limitParam ? Number(limitParam) : 50;

    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(Math.floor(parsedLimit), 1), 100)
      : 50;

    let rows: ReplayRow[];

    if (eventId) {
      rows = db
        .prepare(
          `
          SELECT
            id,
            event_id,
            timestamp,
            method,
            url,
            status,
            duration,
            payload,
            response_body,
            response_headers,
            created_at
          FROM replays
          WHERE event_id = ?
          ORDER BY created_at DESC
          LIMIT ?
          `,
        )
        .all(eventId, limit) as ReplayRow[];
    } else {
      rows = db
        .prepare(
          `
          SELECT
            id,
            event_id,
            timestamp,
            method,
            url,
            status,
            duration,
            payload,
            response_body,
            response_headers,
            created_at
          FROM replays
          ORDER BY created_at DESC
          LIMIT ?
          `,
        )
        .all(limit) as ReplayRow[];
    }

    return NextResponse.json({
      replays: rows.map(serializeReplay),

      count: rows.length,
    });
  } catch (error) {
    console.error("Failed to load replays:", error);

    return NextResponse.json(
      {
        // Details stay in the server log; they can name paths or internals.
        error: "Failed to load replays.",
      },
      {
        status: 500,
      },
    );
  }
}
