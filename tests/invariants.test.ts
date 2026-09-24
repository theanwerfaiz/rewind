import { describe, expect, it } from "vitest";

import {
  describeInvariant,
  evaluateInvariant,
  parseInvariant,
  type Invariant,
  type InvariantSubject,
} from "@/lib/invariants";
import type { RewindEvent } from "@/lib/mock-events";

function event(overrides: Partial<RewindEvent>): RewindEvent {
  return {
    id: "evt_x",
    timestamp: "2026-09-01T10:00:00.000Z",
    type: "http.request",
    title: "POST /api/checkout",
    status: "success",
    ...overrides,
  };
}

const subject: InvariantSubject = {
  status: "success",
  startedAt: "2026-09-01T10:00:00.000Z",
  endedAt: "2026-09-01T10:00:00.250Z",
  rootEventId: "evt_root",
  events: [
    event({
      id: "evt_root",
      metadata: {
        response: {
          status: 200,
          body: {
            ok: true,
            order: {
              status: "paid",
              items: [{ sku: "A" }],
            },
          },
        },
      },
    }),
    event({
      id: "evt_charge_1",
      type: "http.dependency",
      title: "POST https://api.stripe.test/v1/charges",
    }),
    event({
      id: "evt_charge_2",
      type: "http.dependency",
      title: "POST https://api.stripe.test/v1/charges",
    }),
  ],
};

function check(definition: Record<string, unknown>) {
  const parsed = parseInvariant(definition);

  if ("error" in parsed) {
    throw new Error(parsed.error);
  }

  return evaluateInvariant(
    {
      ...parsed.invariant,
      id: "inv_test",
    } as Invariant,
    subject,
  );
}

describe("evaluateInvariant", () => {
  it.each([
    [{ kind: "http_status", equals: 200 }, true, "200"],
    [{ kind: "http_status", equals: 201 }, false, "200"],
    [{ kind: "max_duration_ms", value: 300 }, true, "250ms"],
    [{ kind: "max_duration_ms", value: 100 }, false, "250ms"],
    [{ kind: "response_field", path: "ok", equals: true }, true, "true"],
    [
      { kind: "response_field", path: "order.status", equals: "paid" },
      true,
      '"paid"',
    ],
    [
      { kind: "response_field", path: "order.items.0.sku", equals: "A" },
      true,
      '"A"',
    ],
    [
      { kind: "response_field", path: "order.refund", equals: null },
      false,
      "missing",
    ],
    [
      {
        kind: "event_exists",
        title: "POST https://api.stripe.test/v1/charges",
      },
      true,
      "2 events",
    ],
    [{ kind: "event_absent", title: "DB: rollback order" }, true, "0 events"],
    [
      {
        kind: "max_event_count",
        title: "POST https://api.stripe.test/v1/charges",
        max: 1,
      },
      false,
      "2 events",
    ],
    [{ kind: "no_unhandled_errors" }, true, "success"],
  ])("evaluates %j", (definition, passed, actual) => {
    expect(check(definition)).toEqual({
      invariantId: "inv_test",
      passed,
      actual,
    });
  });

  it("matches event titles with different IDs in their paths", () => {
    expect(
      evaluateInvariant(
        {
          id: "inv_ids",
          kind: "event_exists",
          title: "GET https://api.test/users/1",
        },
        {
          ...subject,
          events: [event({ title: "GET https://api.test/users/99" })],
        },
      ).passed,
    ).toBe(true);
  });

  it("treats a failed root as an unhandled error", () => {
    expect(
      evaluateInvariant(
        {
          id: "inv_errors",
          kind: "no_unhandled_errors",
        },
        {
          ...subject,
          status: "error",
        },
      ),
    ).toEqual({
      invariantId: "inv_errors",
      passed: false,
      actual: "error",
    });
  });
});

describe("parseInvariant", () => {
  it.each([
    [{ kind: "http_status", equals: 42 }, "HTTP status"],
    [{ kind: "max_duration_ms", value: 0 }, "positive"],
    [{ kind: "response_field", path: "a..b", equals: 1 }, "dot-separated"],
    [{ kind: "response_field", path: "a" }, "equals is required"],
    [{ kind: "event_exists", title: " " }, "must name an event"],
    [{ kind: "max_event_count", title: "x", max: -1 }, "at least 0"],
    [{ kind: "sometimes" }, "kind must be one of"],
    ["nope", "must be an object"],
  ])("rejects %j", (input, message) => {
    const parsed = parseInvariant(input);

    expect("error" in parsed && parsed.error).toContain(message);
  });

  it("drops unknown properties", () => {
    expect(
      parseInvariant({
        kind: "http_status",
        equals: 200,
        sneaky: true,
      }),
    ).toEqual({
      invariant: {
        kind: "http_status",
        equals: 200,
      },
    });
  });
});

describe("describeInvariant", () => {
  it.each([
    [{ kind: "http_status", equals: 200 }, "HTTP status is 200"],
    [{ kind: "max_duration_ms", value: 500 }, "Completes within 500ms"],
    [
      { kind: "response_field", path: "ok", equals: true },
      "response.ok is true",
    ],
    [{ kind: "event_exists", title: "DB: commit" }, '"DB: commit" happens'],
    [
      { kind: "event_absent", title: "DB: rollback" },
      '"DB: rollback" never happens',
    ],
    [
      { kind: "max_event_count", title: "Charge", max: 1 },
      '"Charge" happens at most 1 time',
    ],
    [{ kind: "no_unhandled_errors" }, "No unhandled errors"],
  ] as const)("describes %j", (definition, text) => {
    expect(describeInvariant(definition)).toBe(text);
  });
});
