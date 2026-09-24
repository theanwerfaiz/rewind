import { afterEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import { rewind } from "@/lib/rewind";

import { POST } from "@/app/api/webhooks/capture/route";

afterEach(() => {
  vi.restoreAllMocks();
});

function createRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/webhooks/capture", {
    method: "POST",

    headers: {
      "Content-Type": "application/json",

      ...headers,
    },

    body: JSON.stringify(body),
  });
}

describe("POST /api/webhooks/capture", () => {
  it("captures the webhook payload and request metadata", async () => {
    const capturedEvent = {
      id: "evt_test_webhook",
      timestamp: "2026-09-12T00:00:00.000Z",

      type: "webhook.received" as const,

      title: "Webhook received",

      status: "success" as const,

      duration: null,

      source: "webhook",

      traceId: null,

      requestId: "req_test_webhook",

      sessionId: null,

      userId: null,

      metadata: {},

      payload: {},

      createdAt: "2026-09-12T00:00:00.000Z",
    };

    const captureMock = vi
      .spyOn(rewind, "capture")
      .mockResolvedValue(capturedEvent);

    const response = await POST(
      createRequest(
        {
          id: "webhook_test",
          type: "payment.completed",
          amount: 4999,
        },
        {
          "X-Webhook-Event": "payment.completed",

          "X-Custom-Header": "rewind-test",

          Authorization: "Bearer secret-token",
        },
      ),
    );

    expect(response.status).toBe(201);

    const data = await response.json();

    expect(data.success).toBe(true);

    expect(data.event).toEqual(capturedEvent);

    expect(captureMock).toHaveBeenCalledTimes(1);

    const captureCall = captureMock.mock.calls[0];

    expect(captureCall).toBeDefined();

    if (!captureCall) {
      return;
    }

    const capturedInput = captureCall[0];

    expect(capturedInput.type).toBe("webhook.received");

    expect(capturedInput.title).toBe("Webhook received");

    expect(capturedInput.status).toBe("success");

    expect(capturedInput.source).toBe("webhook");

    expect(capturedInput.metadata).toMatchObject({
      method: "POST",
      path: "/api/webhooks/capture",
    });

    expect(capturedInput.metadata?.headers).toMatchObject({
      "x-webhook-event": "payment.completed",

      "x-custom-header": "rewind-test",

      authorization: "[REDACTED]",
    });

    expect(capturedInput.payload).toEqual({
      id: "webhook_test",
      type: "payment.completed",
      amount: 4999,
    });

    expect(capturedInput.requestId).toMatch(/^req_/);
  });

  it("redacts sensitive headers", async () => {
    const captureMock = vi.spyOn(rewind, "capture").mockResolvedValue({
      id: "evt_sensitive_test",

      timestamp: "2026-09-12T00:00:00.000Z",

      type: "webhook.received",

      title: "Webhook received",

      status: "success",

      duration: null,

      source: "webhook",

      traceId: null,

      requestId: "req_sensitive",

      sessionId: null,

      userId: null,

      metadata: {},

      payload: {},

      createdAt: "2026-09-12T00:00:00.000Z",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/webhooks/capture",
      {
        method: "POST",

        headers: {
          Authorization: "Bearer super-secret",

          Cookie: "session=super-secret",

          "X-Api-Key": "api-key-secret",

          "X-Auth-Token": "auth-token-secret",

          "X-Safe-Header": "safe-value",

          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          test: true,
        }),
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(201);

    expect(captureMock).toHaveBeenCalledTimes(1);

    const captureCall = captureMock.mock.calls[0];

    expect(captureCall).toBeDefined();

    if (!captureCall) {
      return;
    }

    const capturedInput = captureCall[0];

    const headers = capturedInput.metadata?.headers as
      | Record<string, string>
      | undefined;

    expect(headers).toBeDefined();

    expect(headers?.["authorization"]).toBe("[REDACTED]");

    expect(headers?.["cookie"]).toBe("[REDACTED]");

    expect(headers?.["x-api-key"]).toBe("[REDACTED]");

    expect(headers?.["x-auth-token"]).toBe("[REDACTED]");

    expect(headers?.["x-safe-header"]).toBe("safe-value");
  });

  it("returns 500 when webhook capture fails", async () => {
    vi.spyOn(rewind, "capture").mockRejectedValue(
      new Error("Capture service unavailable"),
    );

    const response = await POST(
      createRequest({
        test: true,
      }),
    );

    expect(response.status).toBe(500);

    const data = await response.json();

    expect(data.error).toContain("Capture service unavailable");
  });

  it("captures correlation IDs from webhook headers", async () => {
    const captureMock = vi.spyOn(rewind, "capture").mockResolvedValue({
      id: "evt_webhook_correlation",
      timestamp: "2026-09-12T00:00:00.000Z",
      type: "webhook.received",
      title: "Webhook received",
      status: "success",
    });

    await POST(
      createRequest(
        {
          id: "webhook_correlation",
        },
        {
          "X-Request-Id": "req_webhook",
          "X-Session-Id": "sess_webhook",
          "X-User-Id": "user_webhook",
          traceparent:
            "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        },
      ),
    );

    expect(captureMock.mock.calls[0][0]).toMatchObject({
      requestId: "req_webhook",
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      spanId: "00f067aa0ba902b7",
      sessionId: "sess_webhook",
      userId: "user_webhook",
    });
  });

  it("generates a request ID when none is provided", async () => {
    const captureMock = vi.spyOn(rewind, "capture").mockResolvedValue({
      id: "evt_webhook_generated",
      timestamp: "2026-09-12T00:00:00.000Z",
      type: "webhook.received",
      title: "Webhook received",
      status: "success",
    });

    await POST(
      createRequest({
        id: "webhook_generated",
      }),
    );

    expect(captureMock.mock.calls[0][0].requestId).toMatch(/^req_/);
  });

  it("opens a new execution for each webhook", async () => {
    const captureMock = vi.spyOn(rewind, "capture").mockResolvedValue({
      id: "evt_webhook_execution",
      timestamp: "2026-09-12T00:00:00.000Z",
      type: "webhook.received",
      title: "Webhook received",
      status: "success",
    });

    await POST(createRequest({ id: "first" }));
    await POST(createRequest({ id: "second" }));

    const first = captureMock.mock.calls[0][0].executionId;
    const second = captureMock.mock.calls[1][0].executionId;

    expect(first).toMatch(/^exe_/);
    expect(second).toMatch(/^exe_/);
    expect(first).not.toBe(second);
  });
});
