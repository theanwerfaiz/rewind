import { describe, expect, it } from "vitest";

import { buildExecutionGraph, type EventEdge } from "@/lib/event-graph";
import {
  computeFailureFingerprint,
  normalizeEndpoint,
  normalizeMessage,
} from "@/lib/fingerprint";
import type { EventStatus, EventType, RewindEvent } from "@/lib/mock-events";

describe("normalizeMessage", () => {
  it.each([
    ["Payment timeout after 5000ms", "payment timeout after <n>"],
    ["Payment timeout after 3000ms", "payment timeout after <n>"],
    [
      "User 7f1c2d3e-8a9b-4c5d-9e0f-1a2b3c4d5e6f not found",
      "user <uuid> not found",
    ],
    ["Order evt_123abc failed", "order <id> failed"],
    ["Charge ch_3NfA2x9K failed", "charge <id> failed"],
    ['Invalid value "abc" for field', "invalid value <str> for field"],
    ["Email bob@example.com bounced", "email <email> bounced"],
    ["Commit deadbeef1234 broke it", "commit <hex> broke it"],
    ["  Multiple   spaces\nhere ", "multiple spaces here"],
  ])("normalises %j", (input, expected) => {
    expect(normalizeMessage(input)).toBe(expected);
  });

  it("keeps ordinary words that look like hex", () => {
    expect(normalizeMessage("deadline exceeded in cafe")).toBe(
      "deadline exceeded in cafe",
    );
  });

  it("caps very long messages", () => {
    expect(normalizeMessage("x".repeat(1000))).toHaveLength(200);
  });
});

describe("normalizeEndpoint", () => {
  it.each([
    ["GET /api/users/42", "GET /api/users/:id"],
    ["GET /api/users/42/orders/7", "GET /api/users/:id/orders/:id"],
    [
      "DELETE /api/items/7f1c2d3e-8a9b-4c5d-9e0f-1a2b3c4d5e6f",
      "DELETE /api/items/:id",
    ],
    ["POST /api/checkout?cart=9&retry=1", "POST /api/checkout"],
    ["GET /api/events/evt_1a2b3c", "GET /api/events/:id"],
    ["GET /api/v2/users", "GET /api/v2/users"],
    ["GET /", "GET /"],
    ["Webhook received", "webhook received"],
    [
      "POST https://API.Stripe.test/v1/customers/cus_9a8b7c/charges",
      "POST https://api.stripe.test/v1/customers/:id/charges",
    ],
  ])("normalises %j", (input, expected) => {
    expect(normalizeEndpoint(input)).toBe(expected);
  });
});

type Spec = {
  id: string;
  type?: EventType;
  title: string;
  status?: EventStatus;
  parent?: string;
  metadata?: Record<string, unknown>;
};

function execution(specs: Spec[]) {
  const events: RewindEvent[] = specs.map((spec, index) => ({
    id: spec.id,
    timestamp: `2026-09-01T10:00:00.${String(index * 10).padStart(3, "0")}Z`,
    type: spec.type ?? "http.request",
    title: spec.title,
    status: spec.status ?? "success",
    parentEventId: spec.parent ?? null,
    metadata: spec.metadata,
  }));

  const edges: EventEdge[] = specs
    .filter((spec) => spec.parent)
    .map((spec) => ({
      id: `edg_${spec.id}`,
      executionId: "exe",
      fromEventId: spec.parent!,
      toEventId: spec.id,
      type: "parent_of",
      origin: "explicit",
      confidence: 1,
      createdAt: "2026-09-01T10:00:01.000Z",
    }));

  return computeFailureFingerprint(buildExecutionGraph(events, edges));
}

function checkoutTimeout(orderId: string, timeoutMs: number) {
  return execution([
    {
      id: `root_${orderId}`,
      title: `POST /api/orders/${orderId}/checkout`,
      status: "error",
      metadata: {
        response: {
          status: 500,
        },
      },
    },
    {
      id: `timeout_${orderId}`,
      type: "error",
      title: `Payment timeout after ${timeoutMs}ms`,
      status: "error",
      parent: `root_${orderId}`,
    },
  ]);
}

describe("computeFailureFingerprint", () => {
  it("returns null for a successful execution", () => {
    expect(execution([{ id: "ok", title: "GET /health" }])).toBeNull();
  });

  it("groups the same failure across different IDs and timings", () => {
    const first = checkoutTimeout("1001", 5000);
    const second = checkoutTimeout("2002", 7500);

    expect(first).not.toBeNull();
    expect(first?.id).toMatch(/^fp_[0-9a-f]{16}$/);
    expect(second?.id).toBe(first?.id);

    expect(first?.signature).toEqual({
      endpoint: "POST /api/orders/:id/checkout",
      originType: "error",
      message: "payment timeout after <n>",
      status: null,
      path: "http.request>error",
    });
  });

  it("separates failures with a different message", () => {
    const timeout = checkoutTimeout("1", 5000);

    const declined = execution([
      {
        id: "root",
        title: "POST /api/orders/1/checkout",
        status: "error",
      },
      {
        id: "declined",
        type: "error",
        title: "Card declined",
        status: "error",
        parent: "root",
      },
    ]);

    expect(declined?.id).not.toBe(timeout?.id);
  });

  it("separates the same message on a different endpoint", () => {
    const checkout = checkoutTimeout("1", 5000);

    const refund = execution([
      { id: "root", title: "POST /api/refunds", status: "error" },
      {
        id: "timeout",
        type: "error",
        title: "Payment timeout after 5000ms",
        status: "error",
        parent: "root",
      },
    ]);

    expect(refund?.id).not.toBe(checkout?.id);
  });

  it("separates HTTP failures by status code", () => {
    const withStatus = (status: number) =>
      execution([
        {
          id: "root",
          title: "GET /api/users/1",
          status: "error",
          metadata: {
            response: {
              status,
            },
          },
        },
      ]);

    expect(withStatus(404)?.signature).toMatchObject({
      status: 404,
      message: "GET /api/users/:id",
    });
    expect(withStatus(404)?.id).not.toBe(withStatus(503)?.id);
  });

  it("prefers the captured error message over the event title", () => {
    const fingerprint = execution([
      {
        id: "root",
        title: "POST /api/import",
        status: "error",
        metadata: {
          error: "Unexpected token < in JSON at position 42",
          response: {
            status: 500,
          },
        },
      },
    ]);

    expect(fingerprint?.signature.message).toBe(
      "unexpected token < in json at position <n>",
    );
  });

  it("separates failures that took a different path", () => {
    const direct = checkoutTimeout("1", 5000);

    const viaService = execution([
      { id: "root", title: "POST /api/orders/1/checkout", status: "error" },
      {
        id: "payments",
        title: "POST /api/payments",
        status: "error",
        parent: "root",
      },
      {
        id: "timeout",
        type: "error",
        title: "Payment timeout after 5000ms",
        status: "error",
        parent: "payments",
      },
    ]);

    expect(viaService?.signature.path).toBe("http.request>http.request>error");
    expect(viaService?.id).not.toBe(direct?.id);
  });
});
