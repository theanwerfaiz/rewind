import { afterEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import db from "@/lib/db";

import { POST } from "@/app/api/replay/route";

import { getReplayById } from "@/lib/replays";

import { GET as getReplayPlan } from "@/app/api/replays/[id]/plan/route";

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

describe("POST /api/replay experiments", () => {
  function mockTarget(onRequest?: (headers: Headers) => void) {
    return vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_url, init) => {
        onRequest?.(new Headers(init?.headers));

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      });
  }

  function sentRequest(fetchMock: ReturnType<typeof mockTarget>) {
    const [url, init] = fetchMock.mock.calls[0];

    return {
      url: String(url),
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
  }

  it("applies payload, header and query mutations to the replayed request", async () => {
    const eventId = createHttpEvent({
      headers: {
        "x-feature": "on",
        "content-type": "application/json",
      },
    });

    const fetchMock = mockTarget();

    const response = await POST(
      createRequest({
        eventId,
        label: "zero amount, feature off",
        mutations: [
          { target: "payload", op: "set", path: "amount", value: 0 },
          { target: "payload", op: "remove", path: "captured" },
          { target: "header", op: "set", name: "x-feature", value: "off" },
          { target: "query", op: "set", name: "retry", value: "1" },
        ],
      }),
    );

    expect(response.status).toBe(200);

    const sent = sentRequest(fetchMock);

    expect(sent.url).toBe("http://localhost:3000/api/test-capture?retry=1");

    expect(sent.body).toEqual({
      message: "Original payload",
      amount: 0,
    });

    expect(sent.headers.get("x-feature")).toBe("off");
  });

  it("never modifies the original event", async () => {
    const eventId = createHttpEvent();

    const before = db.prepare(`SELECT * FROM events WHERE id = ?`).get(eventId);

    mockTarget();

    await POST(
      createRequest({
        eventId,
        mutations: [
          { target: "payload", op: "set", path: "message", value: "changed" },
        ],
      }),
    );

    expect(db.prepare(`SELECT * FROM events WHERE id = ?`).get(eventId)).toEqual(
      before,
    );
  });

  it("stores the experiment with its label, mutations and source execution", async () => {
    const eventId = createHttpEvent();

    db.prepare(`UPDATE events SET execution_id = ? WHERE id = ?`).run(
      "exe_source_experiment",
      eventId,
    );

    mockTarget();

    const mutations = [
      { target: "payload", op: "set", path: "message", value: "changed" },
    ];

    const response = await POST(
      createRequest({
        eventId,
        label: "  changed message  ",
        mutations,
      }),
    );

    const data = await response.json();

    expect(data.replay.id).toMatch(/^replay_/);

    expect(getReplayById(data.replay.id)).toMatchObject({
      eventId,
      label: "changed message",
      mutations,
      sourceExecutionId: "exe_source_experiment",
      resultExecutionId: null,
      payload: {
        message: "changed",
        captured: true,
      },
    });
  });

  it("links the experiment to the execution its replay produced", async () => {
    const eventId = createHttpEvent();

    let assignedExecutionId: string | null = null;

    // Simulate the target application capturing the replayed request.
    mockTarget((headers) => {
      assignedExecutionId = headers.get("x-rewind-execution-id");

      const now = new Date().toISOString();

      db.prepare(
        `
        INSERT INTO executions (
          id, started_at, ended_at, status, event_count, created_at, updated_at
        )
        VALUES (?, ?, ?, 'success', 1, ?, ?)
        `,
      ).run(assignedExecutionId, now, now, now, now);
    });

    const response = await POST(
      createRequest({
        eventId,
      }),
    );

    const data = await response.json();

    expect(assignedExecutionId).toMatch(/^exe_/);
    expect(data.replay.resultExecutionId).toBe(assignedExecutionId);

    expect(getReplayById(data.replay.id)?.resultExecutionId).toBe(
      assignedExecutionId,
    );

    db.prepare(`DELETE FROM executions WHERE id = ?`).run(assignedExecutionId);
  });

  it("sends fresh replay identity headers and drops captured Rewind headers", async () => {
    const eventId = createHttpEvent({
      headers: {
        "x-rewind-replay-id": "replay_stale",
        "x-rewind-execution-id": "exe_stale",
        "x-rewind-anything": "stale",
      },
    });

    const fetchMock = mockTarget();

    const response = await POST(
      createRequest({
        eventId,
      }),
    );

    const data = await response.json();

    const { headers } = sentRequest(fetchMock);

    expect(headers.get("x-rewind-replay-id")).toBe(data.replay.id);
    expect(headers.get("x-rewind-execution-id")).toMatch(/^exe_[0-9a-f-]{36}$/);
    expect(headers.get("x-rewind-anything")).toBeNull();
    expect(headers.get("x-rewind-original-event")).toBe(eventId);
  });

  it.each([
    [
      "an invalid mutation",
      [{ target: "payload", op: "set", path: "__proto__.x", value: 1 }],
    ],
    [
      "a credential header mutation",
      [{ target: "header", op: "set", name: "authorization", value: "Bearer x" }],
    ],
  ])("rejects %s without replaying", async (_label, mutations) => {
    const eventId = createHttpEvent();

    const fetchMock = mockTarget();

    const response = await POST(
      createRequest({
        eventId,
        mutations,
      }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an overly long label", async () => {
    const response = await POST(
      createRequest({
        eventId: createHttpEvent(),
        label: "x".repeat(121),
      }),
    );

    expect(response.status).toBe(400);
  });
});

describe("POST /api/replay dependency plans", () => {
  function mockTarget() {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", {
        status: 200,
      }),
    );
  }

  async function fetchPlan(replayId: string) {
    const response = await getReplayPlan(
      new NextRequest(`http://localhost:3000/api/replays/${replayId}/plan`),
      {
        params: Promise.resolve({
          id: replayId,
        }),
      },
    );

    return {
      status: response.status,
      data: await response.json(),
    };
  }

  it("serves the original execution's dependency responses by default", async () => {
    const eventId = createHttpEvent();

    const executionId = `exe_plan_${Date.now()}`;

    db.prepare(`UPDATE events SET execution_id = ? WHERE id = ?`).run(
      executionId,
      eventId,
    );

    const dependencyId = `evt_plan_dep_${Date.now()}`;

    db.prepare(
      `
      INSERT INTO events (
        id, timestamp, type, title, status, execution_id, parent_event_id,
        metadata, created_at
      )
      VALUES (?, ?, 'http.dependency', ?, 'success', ?, ?, ?, ?)
      `,
    ).run(
      dependencyId,
      new Date().toISOString(),
      "POST https://api.stripe.test/v1/charges",
      executionId,
      eventId,
      JSON.stringify({
        response: {
          status: 201,
          statusText: "Created",
          headers: {
            "content-type": "application/json",
          },
          body: {
            id: "ch_recorded",
          },
        },
      }),
      new Date().toISOString(),
    );

    mockTarget();

    const response = await POST(
      createRequest({
        eventId,
        mutations: [
          {
            target: "dependency",
            op: "set",
            match: "POST https://api.stripe.test/v1/charges",
            override: {
              delayMs: 6000,
            },
          },
        ],
      }),
    );

    const { replay } = await response.json();

    expect(replay.dependencyMode).toBe("recorded");
    expect(getReplayById(replay.id)?.dependencyMode).toBe("recorded");

    const { status, data } = await fetchPlan(replay.id);

    expect(status).toBe(200);

    expect(data.plan).toEqual({
      replayId: replay.id,
      mode: "recorded",
      fixtures: [
        {
          key: "POST https://api.stripe.test/v1/charges",
          title: "POST https://api.stripe.test/v1/charges",
          status: 201,
          statusText: "Created",
          headers: {
            "content-type": "application/json",
          },
          body: {
            id: "ch_recorded",
          },
          truncated: false,
        },
      ],
      dependencyMutations: [
        {
          target: "dependency",
          op: "set",
          match: "POST https://api.stripe.test/v1/charges",
          override: {
            delayMs: 6000,
          },
        },
      ],
    });

    db.prepare(`DELETE FROM events WHERE id = ?`).run(dependencyId);
  });

  it("stores an explicit live mode", async () => {
    mockTarget();

    const response = await POST(
      createRequest({
        eventId: createHttpEvent(),
        dependencyMode: "live",
      }),
    );

    const { replay } = await response.json();

    const { data } = await fetchPlan(replay.id);

    expect(data.plan.mode).toBe("live");
    expect(data.plan.fixtures).toEqual([]);
  });

  it("rejects an unknown dependency mode", async () => {
    const fetchMock = mockTarget();

    const response = await POST(
      createRequest({
        eventId: createHttpEvent(),
        dependencyMode: "yolo",
      }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown plan", async () => {
    expect((await fetchPlan("replay_unknown")).status).toBe(404);
  });
});
