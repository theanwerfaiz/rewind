import { afterEach, describe, expect, it, vi } from "vitest";

import { rewind } from "@/lib/rewind";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rewind.capture", () => {
  it("captures an event and returns the created event", async () => {
    const createdEvent = {
      id: "evt_test_capture_001",
      timestamp: "2026-09-11T18:00:00.000Z",
      type: "http.request" as const,
      title: "POST /api/test-capture",
      status: "success" as const,
      duration: "42ms",
      source: "test-api",

      traceId: null,
      requestId: "req_test_001",
      sessionId: null,
      userId: "user_001",

      metadata: {
        environment: "test",
        method: "POST",
        path: "/api/test-capture",
      },

      payload: {
        message: "Hello from test",
        captured: true,
      },

      createdAt: "2026-09-11T18:00:00.000Z",
    };

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          event: createdEvent,
        }),
        {
          status: 201,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const event = await rewind.capture({
      type: "http.request",
      title: "POST /api/test-capture",
      status: "success",
      duration: "42ms",
      source: "test-api",

      requestId: "req_test_001",
      userId: "user_001",

      metadata: {
        environment: "test",
        method: "POST",
        path: "/api/test-capture",
      },

      payload: {
        message: "Hello from test",
        captured: true,
      },
    });

    expect(event).toEqual(createdEvent);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the event to the configured endpoint", async () => {
    const createdEvent = {
      id: "evt_test_capture_002",
      timestamp: "2026-09-11T18:00:00.000Z",
      type: "error" as const,
      title: "Payment failed",
      status: "error" as const,
      duration: null,
      source: "test",

      traceId: null,
      requestId: null,
      sessionId: null,
      userId: null,

      metadata: {
        environment: "test",
      },

      payload: {
        message: "Payment failed",
      },

      createdAt: "2026-09-11T18:00:00.000Z",
    };

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          event: createdEvent,
        }),
        {
          status: 201,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await rewind.capture(
      {
        type: "error",
        title: "Payment failed",
        status: "error",

        metadata: {
          environment: "test",
        },

        payload: {
          message: "Payment failed",
        },
      },
      {
        endpoint: "http://localhost:3000/api/events",
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/events",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );
  });

  it("throws when the capture API returns an error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "Database unavailable",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await expect(
      rewind.capture({
        type: "error",
        title: "Test failure",
        status: "error",
      }),
    ).rejects.toThrow("Rewind capture failed (500)");
  });

  it("throws when the API response does not contain an event", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
        }),
        {
          status: 201,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await expect(
      rewind.capture({
        type: "error",
        title: "Missing event response",
        status: "error",
      }),
    ).rejects.toThrow("API response did not contain an event");
  });
});
