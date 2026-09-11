import { afterEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import db from "@/lib/db";

import { POST } from "@/app/api/replay/route";

afterEach(() => {
  vi.restoreAllMocks();
});

function createRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/replay", {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify(body),
  });
}

function createHttpEvent(metadataOverride: Record<string, unknown> = {}) {
  const id = `evt_replay_test_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  db.prepare(
    `
    INSERT INTO events (
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
      @request_id,
      @session_id,
      @user_id,
      @metadata,
      @payload,
      @created_at
    )
    `,
  ).run({
    id,

    timestamp: new Date().toISOString(),

    type: "http.request",

    title: "POST /api/test-capture",

    status: "success",

    duration: "42ms",

    source: "test",

    trace_id: null,

    request_id: `req_${Date.now()}`,

    session_id: null,

    user_id: "test_user",

    metadata: JSON.stringify({
      method: "POST",

      path: "/api/test-capture",

      ...metadataOverride,
    }),

    payload: JSON.stringify({
      message: "Original payload",
      captured: true,
    }),

    created_at: new Date().toISOString(),
  });

  return id;
}

describe("POST /api/replay", () => {
  it("replays an HTTP event", async () => {
    const eventId = createHttpEvent();

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          received: true,
        }),
        {
          status: 200,

          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const response = await POST(
      createRequest({
        eventId,
      }),
    );

    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data.success).toBe(true);

    expect(data.replay.status).toBe(200);

    expect(data.replay.method).toBe("POST");

    expect(data.replay.url).toBe("http://localhost:3000/api/test-capture");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("replays with a modified payload", async () => {
    const eventId = createHttpEvent();

    const modifiedPayload = {
      message: "Modified payload",
      captured: false,
    };

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          received: modifiedPayload,
        }),
        {
          status: 200,

          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const response = await POST(
      createRequest({
        eventId,

        payload: modifiedPayload,
      }),
    );

    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data.replay.payload).toEqual(modifiedPayload);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const fetchCall = fetchMock.mock.calls[0];

    expect(fetchCall).toBeDefined();

    if (!fetchCall) {
      return;
    }

    const fetchOptions = fetchCall[1];

    expect(fetchOptions).toBeDefined();

    if (!fetchOptions) {
      return;
    }

    expect(fetchOptions.method).toBe("POST");

    expect(JSON.parse(fetchOptions.body as string)).toEqual(modifiedPayload);
  });

  it("replays captured request headers", async () => {
    const eventId = createHttpEvent({
      headers: {
        "content-type": "application/json",

        "x-webhook-event": "payment.completed",

        "x-request-trace": "trace-123",
      },
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
        }),
        {
          status: 200,
        },
      ),
    );

    await POST(
      createRequest({
        eventId,
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const fetchCall = fetchMock.mock.calls[0];

    expect(fetchCall).toBeDefined();

    if (!fetchCall) {
      return;
    }

    const fetchOptions = fetchCall[1];

    expect(fetchOptions).toBeDefined();

    if (!fetchOptions) {
      return;
    }

    const headers = fetchOptions.headers as Record<string, string>;

    expect(headers["content-type"]).toBe("application/json");

    expect(headers["x-webhook-event"]).toBe("payment.completed");

    expect(headers["x-request-trace"]).toBe("trace-123");

    expect(headers["X-Rewind-Replay"]).toBe("true");

    expect(headers["X-Rewind-Original-Event"]).toBe(eventId);
  });

  it("does not replay sensitive or transport-specific headers", async () => {
    const eventId = createHttpEvent({
      headers: {
        authorization: "[REDACTED]",

        cookie: "[REDACTED]",

        "set-cookie": "[REDACTED]",

        "x-api-key": "[REDACTED]",

        "x-auth-token": "[REDACTED]",

        host: "localhost:3000",

        "content-length": "123",

        connection: "keep-alive",

        "x-safe-header": "safe-value",
      },
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
        }),
        {
          status: 200,
        },
      ),
    );

    await POST(
      createRequest({
        eventId,
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const fetchCall = fetchMock.mock.calls[0];

    expect(fetchCall).toBeDefined();

    if (!fetchCall) {
      return;
    }

    const fetchOptions = fetchCall[1];

    expect(fetchOptions).toBeDefined();

    if (!fetchOptions) {
      return;
    }

    const headers = fetchOptions.headers as Record<string, string>;

    expect(headers.authorization).toBeUndefined();

    expect(headers.cookie).toBeUndefined();

    expect(headers["set-cookie"]).toBeUndefined();

    expect(headers["x-api-key"]).toBeUndefined();

    expect(headers["x-auth-token"]).toBeUndefined();

    expect(headers.host).toBeUndefined();

    expect(headers["content-length"]).toBeUndefined();

    expect(headers.connection).toBeUndefined();

    expect(headers["x-safe-header"]).toBe("safe-value");
  });

  it("preserves the captured HTTP method", async () => {
    const eventId = createHttpEvent({
      method: "PATCH",
      path: "/api/test-capture",
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
        }),
        {
          status: 200,
        },
      ),
    );

    await POST(
      createRequest({
        eventId,
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const fetchCall = fetchMock.mock.calls[0];

    expect(fetchCall).toBeDefined();

    if (!fetchCall) {
      return;
    }

    const fetchOptions = fetchCall[1];

    expect(fetchOptions).toBeDefined();

    if (!fetchOptions) {
      return;
    }

    expect(fetchOptions.method).toBe("PATCH");

    expect(fetchOptions.body).toBeDefined();
  });

  it("returns 400 when eventId is missing", async () => {
    const response = await POST(createRequest({}));

    expect(response.status).toBe(400);

    const data = await response.json();

    expect(data.error).toBe("eventId is required.");
  });

  it("returns 404 when the event does not exist", async () => {
    const response = await POST(
      createRequest({
        eventId: "evt_replay_test_does_not_exist",
      }),
    );

    expect(response.status).toBe(404);

    const data = await response.json();

    expect(data.error).toBe("Event not found.");
  });

  it("rejects non-HTTP events", async () => {
    const id = `evt_replay_error_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    db.prepare(
      `
      INSERT INTO events (
        id,
        timestamp,
        type,
        title,
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(
      id,

      new Date().toISOString(),

      "error",

      "Replay should reject this",

      "error",

      new Date().toISOString(),
    );

    const response = await POST(
      createRequest({
        eventId: id,
      }),
    );

    expect(response.status).toBe(400);

    const data = await response.json();

    expect(data.error).toBe("This event type cannot be replayed right now.");
  });

  it("returns 400 for an invalid request path", async () => {
    const id = `evt_replay_invalid_path_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    db.prepare(
      `
      INSERT INTO events (
        id,
        timestamp,
        type,
        title,
        status,
        metadata,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      id,

      new Date().toISOString(),

      "http.request",

      "Invalid replay path",

      "success",

      JSON.stringify({
        method: "POST",

        path: "not-a-valid-path",
      }),

      new Date().toISOString(),
    );

    const response = await POST(
      createRequest({
        eventId: id,
      }),
    );

    expect(response.status).toBe(400);

    const data = await response.json();

    expect(data.error).toBe("Event does not contain a valid request path.");
  });

  it("returns 502 when the replay target is unavailable", async () => {
    const eventId = createHttpEvent();

    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("connect ECONNREFUSED"),
    );

    const response = await POST(
      createRequest({
        eventId,
      }),
    );

    expect(response.status).toBe(502);

    const data = await response.json();

    expect(data.error).toContain("Could not reach the local replay target.");

    expect(data.eventId).toBe(eventId);
  });
});
