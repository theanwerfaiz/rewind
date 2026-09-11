import { afterEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import { rewind } from "@/lib/rewind";

import { withRewindCapture } from "@/lib/rewind-http";

afterEach(() => {
  vi.restoreAllMocks();
});

function createRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/example", {
    method: "POST",

    headers: {
      "Content-Type": "application/json",

      ...headers,
    },

    body: JSON.stringify(body),
  });
}

describe("withRewindCapture", () => {
  it("captures query parameters in the request path", async () => {
    const captureMock = vi.spyOn(rewind, "capture").mockResolvedValue({
      id: "evt_query_test",
      timestamp: "2026-09-12T00:00:00.000Z",
      type: "http.request",
      title: "POST /api/example?mode=test&case=42",
      status: "success",
      duration: "10ms",
      source: "next-http",
      traceId: null,
      requestId: null,
      sessionId: null,
      userId: null,
      metadata: {},
      payload: {},
      createdAt: "2026-09-12T00:00:00.000Z",
    });

    const handler = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
    );

    const request = new NextRequest(
      "http://localhost:3000/api/example?mode=test&case=42",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "query test",
        }),
      },
    );

    const wrapped = withRewindCapture(handler);

    const response = await wrapped(request);

    expect(response.status).toBe(200);

    expect(captureMock).toHaveBeenCalledTimes(1);

    const captureCall = captureMock.mock.calls[0];

    expect(captureCall).toBeDefined();

    if (!captureCall) {
      return;
    }

    const capturedEvent = captureCall[0];

    expect(capturedEvent.title).toBe("POST /api/example?mode=test&case=42");

    expect(capturedEvent.metadata).toMatchObject({
      method: "POST",
      path: "/api/example?mode=test&case=42",
    });
  });
  it("captures a successful HTTP request", async () => {
    const captureMock = vi.spyOn(rewind, "capture").mockResolvedValue({
      id: "evt_http_test",

      timestamp: "2026-09-12T00:00:00.000Z",

      type: "http.request",

      title: "POST /api/example",

      status: "success",

      duration: "10ms",

      source: "next-http",

      traceId: null,

      requestId: "req_http_test",

      sessionId: null,

      userId: null,

      metadata: {},

      payload: {},

      createdAt: "2026-09-12T00:00:00.000Z",
    });

    const handler = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
          }),
          {
            status: 200,

            statusText: "OK",

            headers: {
              "Content-Type": "application/json",

              "X-Request-Trace": "trace-123",

              "Set-Cookie": "session=secret-cookie",
            },
          },
        ),
    );

    const wrapped = withRewindCapture(handler);

    const response = await wrapped(
      createRequest(
        {
          message: "Hello Rewind",
        },
        {
          "X-Request-Id": "req_http_test",
        },
      ),
    );

    expect(response.status).toBe(200);

    expect(handler).toHaveBeenCalledTimes(1);

    expect(captureMock).toHaveBeenCalledTimes(1);

    const captureCall = captureMock.mock.calls[0];

    expect(captureCall).toBeDefined();

    if (!captureCall) {
      return;
    }

    const capturedEvent = captureCall[0];

    expect(capturedEvent.type).toBe("http.request");

    expect(capturedEvent.title).toBe("POST /api/example");

    expect(capturedEvent.status).toBe("success");

    expect(capturedEvent.source).toBe("next-http");

    expect(capturedEvent.requestId).toBe("req_http_test");

    expect(capturedEvent.payload).toEqual({
      message: "Hello Rewind",
    });

    expect(capturedEvent.duration).toMatch(/^\d+ms$/);

    expect(capturedEvent.metadata).toMatchObject({
      method: "POST",

      path: "/api/example",

      response: {
        status: 200,

        statusText: "OK",

        headers: {
          "content-type": "application/json",

          "x-request-trace": "trace-123",

          "set-cookie": "[REDACTED]",
        },

        body: {
          success: true,
        },
      },
    });
  });

  it("captures a failed HTTP request when the handler throws", async () => {
    const captureMock = vi.spyOn(rewind, "capture").mockResolvedValue({
      id: "evt_http_error",

      timestamp: "2026-09-12T00:00:00.000Z",

      type: "http.request",

      title: "POST /api/example",

      status: "error",

      duration: "10ms",

      source: "next-http",

      traceId: null,

      requestId: null,

      sessionId: null,

      userId: null,

      metadata: {},

      payload: {},

      createdAt: "2026-09-12T00:00:00.000Z",
    });

    const handler = vi.fn(async () => {
      throw new Error("Something went wrong");
    });

    const wrapped = withRewindCapture(handler);

    await expect(
      wrapped(
        createRequest({
          message: "This will fail",
        }),
      ),
    ).rejects.toThrow("Something went wrong");

    expect(captureMock).toHaveBeenCalledTimes(1);

    const captureCall = captureMock.mock.calls[0];

    expect(captureCall).toBeDefined();

    if (!captureCall) {
      return;
    }

    const capturedEvent = captureCall[0];

    expect(capturedEvent.type).toBe("http.request");

    expect(capturedEvent.status).toBe("error");

    expect(capturedEvent.title).toBe("POST /api/example");

    expect(capturedEvent.payload).toEqual({
      message: "This will fail",
    });

    expect(capturedEvent.metadata).toMatchObject({
      method: "POST",

      path: "/api/example",

      error: "Something went wrong",

      response: {
        status: 500,

        statusText: "Internal Server Error",
      },
    });
  });

  it("does not break the request when Rewind capture fails", async () => {
    vi.spyOn(rewind, "capture").mockRejectedValue(
      new Error("Rewind unavailable"),
    );

    const handler = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
          }),
          {
            status: 200,
          },
        ),
    );

    const wrapped = withRewindCapture(handler);

    const response = await wrapped(
      createRequest({
        message: "Application should continue",
      }),
    );

    expect(response.status).toBe(200);

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
