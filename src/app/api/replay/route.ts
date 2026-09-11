import { NextRequest, NextResponse } from "next/server";

import db from "@/lib/db";

export const runtime = "nodejs";

type EventRow = {
  id: string;
  timestamp: string;
  type: string;
  title: string;
  status: string;
  duration: string | null;
  source: string | null;
  metadata: string | null;
  payload: string | null;
};

const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];

const REDACTED_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
]);

const SKIPPED_REPLAY_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
]);

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

function isAllowedReplayUrl(url: URL) {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getCapturedHeaders(metadata: unknown) {
  if (!isObject(metadata)) {
    return {};
  }

  const headers = metadata.headers;

  if (!isObject(headers)) {
    return {};
  }

  const replayHeaders: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const normalizedKey = key.toLowerCase();

    if (REDACTED_HEADERS.has(normalizedKey)) {
      continue;
    }

    if (SKIPPED_REPLAY_HEADERS.has(normalizedKey)) {
      continue;
    }

    if (
      normalizedKey === "x-rewind-replay" ||
      normalizedKey === "x-rewind-original-event"
    ) {
      continue;
    }

    if (typeof value !== "string") {
      continue;
    }

    if (value === "[REDACTED]") {
      continue;
    }

    replayHeaders[key] = value;
  }

  return replayHeaders;
}

function createReplayId() {
  return `replay_${crypto.randomUUID()}`;
}

function persistReplay({
  eventId,
  method,
  url,
  status,
  duration,
  payload,
  responseBody,
  responseHeaders,
}: {
  eventId: string;
  method: string;
  url: string;
  status: number;
  duration: string;
  payload: unknown;
  responseBody: unknown;
  responseHeaders: Record<string, string>;
}) {
  const now = new Date().toISOString();

  db.prepare(
    `
      INSERT INTO replays (
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
      )
      VALUES (
        @id,
        @eventId,
        @timestamp,
        @method,
        @url,
        @status,
        @duration,
        @payload,
        @responseBody,
        @responseHeaders,
        @createdAt
      )
    `,
  ).run({
    id: createReplayId(),
    eventId,
    timestamp: now,
    method,
    url,
    status,
    duration,
    payload: payload === undefined ? null : JSON.stringify(payload),
    responseBody:
      responseBody === undefined ? null : JSON.stringify(responseBody),
    responseHeaders: JSON.stringify(responseHeaders),
    createdAt: now,
  });
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: "Request body must contain valid JSON.",
        },
        {
          status: 400,
        },
      );
    }

    if (!isObject(body)) {
      return NextResponse.json(
        {
          error: "Request body must be a JSON object.",
        },
        {
          status: 400,
        },
      );
    }

    const eventId = body.eventId;

    if (typeof eventId !== "string" || eventId.trim().length === 0) {
      return NextResponse.json(
        {
          error: "eventId is required.",
        },
        {
          status: 400,
        },
      );
    }

    const event = db
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
          metadata,
          payload
        FROM events
        WHERE id = ?
        `,
      )
      .get(eventId) as EventRow | undefined;

    if (!event) {
      return NextResponse.json(
        {
          error: "Event not found.",
        },
        {
          status: 404,
        },
      );
    }

    const replayableTypes = ["http.request", "webhook.received"];

    if (!replayableTypes.includes(event.type)) {
      return NextResponse.json(
        {
          error: "This event type cannot be replayed right now.",
        },
        {
          status: 400,
        },
      );
    }

    const metadata = parseJson(event.metadata);

    const method =
      isObject(metadata) && typeof metadata.method === "string"
        ? metadata.method.toUpperCase()
        : "POST";

    if (!ALLOWED_METHODS.includes(method)) {
      return NextResponse.json(
        {
          error: `HTTP method "${method}" is not supported for replay.`,
        },
        {
          status: 400,
        },
      );
    }

    const path =
      isObject(metadata) && typeof metadata.path === "string"
        ? metadata.path
        : null;

    if (!path || !path.startsWith("/")) {
      return NextResponse.json(
        {
          error: "Event does not contain a valid request path.",
        },
        {
          status: 400,
        },
      );
    }

    const baseUrl =
      process.env.REWIND_REPLAY_BASE_URL ?? "http://localhost:3000";

    let replayUrl: URL;

    try {
      replayUrl = new URL(path, baseUrl);
    } catch {
      return NextResponse.json(
        {
          error: "Event contains an invalid replay URL.",
        },
        {
          status: 400,
        },
      );
    }

    if (!isAllowedReplayUrl(replayUrl)) {
      return NextResponse.json(
        {
          error: "Replay is restricted to localhost.",
        },
        {
          status: 400,
        },
      );
    }

    const originalPayload = parseJson(event.payload);

    const hasPayloadOverride = Object.prototype.hasOwnProperty.call(
      body,
      "payload",
    );

    const replayPayload = hasPayloadOverride ? body.payload : originalPayload;

    const capturedHeaders = getCapturedHeaders(metadata);

    const replayHeaders: Record<string, string> = {
      ...capturedHeaders,

      "X-Rewind-Replay": "true",

      "X-Rewind-Original-Event": event.id,
    };

    const hasRequestBody =
      method !== "GET" &&
      method !== "HEAD" &&
      replayPayload !== undefined &&
      replayPayload !== null;

    if (
      hasRequestBody &&
      !Object.keys(replayHeaders).some(
        (key) => key.toLowerCase() === "content-type",
      )
    ) {
      replayHeaders["Content-Type"] = "application/json";
    }

    const startTime = performance.now();

    let replayResponse: Response;

    try {
      replayResponse = await fetch(replayUrl.toString(), {
        method,

        headers: replayHeaders,

        body: hasRequestBody ? JSON.stringify(replayPayload) : undefined,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to reach the replay target.";

      console.error("Replay target unavailable:", error);

      return NextResponse.json(
        {
          error: `Could not reach the local replay target. ${message}`,

          eventId: event.id,

          url: replayUrl.toString(),
        },
        {
          status: 502,
        },
      );
    }

    const durationMs = Math.round(performance.now() - startTime);

    const responseText = await replayResponse.text();

    let responseBody: unknown = responseText;

    try {
      responseBody = JSON.parse(responseText);
    } catch {
      // Keep plain text response.
    }

    const responseHeaders: Record<string, string> = {};

    replayResponse.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    persistReplay({
      eventId: event.id,
      method,
      url: replayUrl.toString(),
      status: replayResponse.status,
      duration: `${durationMs}ms`,
      payload: replayPayload,
      responseBody,
      responseHeaders,
    });

    return NextResponse.json({
      success: replayResponse.ok,

      replay: {
        eventId: event.id,

        eventType: event.type,

        url: replayUrl.toString(),

        method,

        status: replayResponse.status,

        statusText: replayResponse.statusText,

        duration: `${durationMs}ms`,

        headers: replayHeaders,

        body: responseBody,

        payload: replayPayload,
      },
    });
  } catch (error) {
    console.error("Unexpected replay error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected replay error.",
      },
      {
        status: 500,
      },
    );
  }
}
