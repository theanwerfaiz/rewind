import { afterEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import { getExecutionContext } from "@/lib/execution-context";

import { rewind } from "@/lib/rewind";

import { withRewindCapture } from "@/lib/rewind-http";

afterEach(() => {
  vi.restoreAllMocks();
});

function createRequest(path = "/api/example") {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "GET",
  });
}

/**
 * Mocks the capture endpoint and returns the JSON bodies sent to it, in
 * the order they were captured.
 */
function mockCaptureEndpoint() {
  const bodies: Record<string, unknown>[] = [];

  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body));

    bodies.push(body);

    return new Response(
      JSON.stringify({
        event: body,
      }),
      {
        status: 201,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  });

  return bodies;
}

describe("execution identity", () => {
  it("opens a new execution for a root HTTP request", async () => {
    const bodies = mockCaptureEndpoint();

    const handler = withRewindCapture(async () => new Response("ok"));

    await handler(createRequest());

    expect(bodies).toHaveLength(1);

    const [root] = bodies;

    expect(root.id).toMatch(/^evt_/);
    expect(root.executionId).toMatch(/^exe_/);
    expect(root.parentEventId).toBeNull();
    expect(Date.parse(String(root.timestamp))).not.toBeNaN();
  });

  it("gives separate root requests separate executions", async () => {
    const bodies = mockCaptureEndpoint();

    const handler = withRewindCapture(async () => new Response("ok"));

    await handler(createRequest());
    await handler(createRequest());

    expect(bodies[0].executionId).not.toBe(bodies[1].executionId);
  });

  it("attaches events captured inside a request to its execution", async () => {
    const bodies = mockCaptureEndpoint();

    const handler = withRewindCapture(async () => {
      await rewind.capture({
        type: "database.query",
        title: "SELECT * FROM carts",
        status: "success",
      });

      return new Response("ok");
    });

    await handler(createRequest());

    const [child, root] = bodies;

    expect(root.type).toBe("http.request");
    expect(child.type).toBe("database.query");

    expect(child.executionId).toBe(root.executionId);
    expect(child.parentEventId).toBe(root.id);
  });

  it("nests an in-process wrapped handler under the outer request", async () => {
    const bodies = mockCaptureEndpoint();

    const inner = withRewindCapture(async () => new Response("inner"));

    const outer = withRewindCapture(async () => {
      await inner(createRequest("/api/inner"));

      return new Response("outer");
    });

    await outer(createRequest("/api/outer"));

    const [innerEvent, outerEvent] = bodies;

    expect(outerEvent.title).toBe("GET /api/outer");
    expect(innerEvent.title).toBe("GET /api/inner");

    expect(outerEvent.parentEventId).toBeNull();
    expect(innerEvent.executionId).toBe(outerEvent.executionId);
    expect(innerEvent.parentEventId).toBe(outerEvent.id);
  });

  it("keeps the execution when the handler throws", async () => {
    const bodies = mockCaptureEndpoint();

    const handler = withRewindCapture(async () => {
      await rewind.capture({
        type: "error",
        title: "Payment timeout",
        status: "error",
      });

      throw new Error("Payment timeout");
    });

    await expect(handler(createRequest())).rejects.toThrow("Payment timeout");

    const [child, root] = bodies;

    expect(root.status).toBe("error");
    expect(child.executionId).toBe(root.executionId);
    expect(child.parentEventId).toBe(root.id);
  });

  it("does not leak execution context outside the request", async () => {
    mockCaptureEndpoint();

    const handler = withRewindCapture(async () => {
      expect(getExecutionContext()?.executionId).toMatch(/^exe_/);

      return new Response("ok");
    });

    await handler(createRequest());

    expect(getExecutionContext()).toBeUndefined();
  });

  it("captures standalone events without an execution", async () => {
    const bodies = mockCaptureEndpoint();

    await rewind.capture({
      type: "deployment",
      title: "Deploy v1.2.3",
    });

    expect(bodies[0].executionId).toBeUndefined();
    expect(bodies[0].parentEventId).toBeUndefined();
  });

  it("lets callers opt out of the current execution with null", async () => {
    const bodies = mockCaptureEndpoint();

    const handler = withRewindCapture(async () => {
      await rewind.capture({
        type: "command",
        title: "Detached job",
        executionId: null,
        parentEventId: null,
      });

      return new Response("ok");
    });

    await handler(createRequest());

    expect(bodies[0].executionId).toBeNull();
    expect(bodies[0].parentEventId).toBeNull();
  });

  it("uses the execution pre-assigned by a Rewind replay", async () => {
    const bodies = mockCaptureEndpoint();

    const executionId = "exe_0f0e0d0c-0b0a-4908-8706-050403020100";

    const handler = withRewindCapture(async () => new Response("ok"));

    await handler(
      new NextRequest("http://localhost:3000/api/example", {
        headers: {
          "x-rewind-replay-id": "replay_11111111-2222-4333-8444-555555555555",
          "x-rewind-execution-id": executionId,
        },
      }),
    );

    expect(bodies[0].executionId).toBe(executionId);
    expect(bodies[0].parentEventId).toBeNull();
  });

  it.each([
    [
      "no replay id",
      { "x-rewind-execution-id": "exe_0f0e0d0c-0b0a-4908-8706-050403020100" },
    ],
    [
      "a malformed execution id",
      {
        "x-rewind-replay-id": "replay_11111111-2222-4333-8444-555555555555",
        "x-rewind-execution-id": "exe_attacker_chosen",
      },
    ],
  ])("ignores a pre-assigned execution with %s", async (_label, headers) => {
    const bodies = mockCaptureEndpoint();

    const handler = withRewindCapture(async () => new Response("ok"));

    await handler(
      new NextRequest("http://localhost:3000/api/example", {
        headers,
      }),
    );

    expect(bodies[0].executionId).toMatch(/^exe_/);
    expect(bodies[0].executionId).not.toBe(
      "exe_0f0e0d0c-0b0a-4908-8706-050403020100",
    );
    expect(bodies[0].executionId).not.toBe("exe_attacker_chosen");
  });
});
