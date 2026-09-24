import { describe, expect, it } from "vitest";

import { buildExecutionGraph, type EventEdge } from "@/lib/event-graph";
import { diffExecutions, type ExecutionSnapshot } from "@/lib/execution-diff";
import type { EventStatus, EventType, RewindEvent } from "@/lib/mock-events";

type Spec = {
  id: string;
  title: string;
  type?: EventType;
  status?: EventStatus;
  parent?: string;
  at?: number;
  duration?: number;
  httpStatus?: number;
  body?: unknown;
  payload?: unknown;
};

const START = Date.parse("2026-09-01T10:00:00.000Z");

function snapshot(
  executionId: string,
  specs: Spec[],
  options: { fingerprintId?: string | null } = {},
): ExecutionSnapshot {
  const events: RewindEvent[] = specs.map((spec, index) => ({
    id: `${executionId}_${spec.id}`,
    timestamp: new Date(START + (spec.at ?? index * 10)).toISOString(),
    type: spec.type ?? "http.request",
    title: spec.title,
    status: spec.status ?? "success",
    duration: spec.duration !== undefined ? `${spec.duration}ms` : null,
    executionId,
    parentEventId: spec.parent ? `${executionId}_${spec.parent}` : null,
    payload: spec.payload,
    metadata:
      spec.httpStatus !== undefined || spec.body !== undefined
        ? {
            response: {
              status: spec.httpStatus,
              body: spec.body,
            },
          }
        : undefined,
  }));

  const edges: EventEdge[] = events
    .filter((event) => event.parentEventId)
    .map((event) => ({
      id: `edg_${event.id}`,
      executionId,
      fromEventId: event.parentEventId!,
      toEventId: event.id,
      type: "parent_of",
      origin: "explicit",
      confidence: 1,
      createdAt: event.timestamp,
    }));

  const ends = specs.map(
    (spec, index) => (spec.at ?? index * 10) + (spec.duration ?? 0),
  );

  const failed = specs.some((spec) => spec.status === "error");

  return {
    execution: {
      id: executionId,
      status: failed ? "error" : "success",
      startedAt: new Date(START).toISOString(),
      endedAt: new Date(START + Math.max(...ends)).toISOString(),
      fingerprintId: options.fingerprintId ?? (failed ? "fp_default" : null),
    },
    graph: buildExecutionGraph(events, edges),
  };
}

const failingCheckout: Spec[] = [
  {
    id: "root",
    title: "POST /api/orders/1/checkout",
    status: "error",
    httpStatus: 500,
    duration: 180,
    body: { ok: false },
  },
  {
    id: "cart",
    type: "database.query",
    title: "DB: load cart",
    parent: "root",
    at: 10,
    duration: 5,
  },
  {
    id: "pay",
    title: "POST /api/payments",
    status: "error",
    httpStatus: 504,
    parent: "root",
    at: 20,
    duration: 150,
  },
  {
    id: "timeout",
    type: "error",
    title: "Payment timeout after 5000ms",
    status: "error",
    parent: "pay",
    at: 160,
  },
  {
    id: "rollback",
    type: "database.query",
    title: "DB: rollback order",
    parent: "root",
    at: 175,
    duration: 5,
  },
];

const fixedCheckout: Spec[] = [
  {
    id: "root",
    title: "POST /api/orders/1/checkout?dryRun=1",
    httpStatus: 200,
    duration: 60,
    body: { ok: true, orderId: "ord_1" },
  },
  {
    id: "cart",
    type: "database.query",
    title: "DB: load cart",
    parent: "root",
    at: 10,
    duration: 5,
  },
  {
    id: "pay",
    title: "POST /api/payments",
    httpStatus: 201,
    parent: "root",
    at: 20,
    duration: 30,
  },
  {
    id: "commit",
    type: "database.query",
    title: "DB: commit order",
    parent: "root",
    at: 55,
    duration: 4,
  },
];

describe("diffExecutions", () => {
  it("reports an identical re-run as unchanged", () => {
    const diff = diffExecutions(
      snapshot("a", fixedCheckout),
      snapshot("b", fixedCheckout),
    );

    expect(diff.outcome).toBe("unchanged");
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
    expect(diff.unchangedCount).toBe(4);
    expect(diff.firstDivergence).toBeNull();
    expect(diff.summary).toEqual([]);
  });

  it("explains a fixed execution", () => {
    const diff = diffExecutions(
      snapshot("orig", failingCheckout),
      snapshot("fix", fixedCheckout),
    );

    expect(diff.outcome).toBe("fixed");

    expect(diff.original).toMatchObject({
      status: "error",
      httpStatus: 500,
      durationMs: 180,
      eventCount: 5,
    });

    expect(diff.candidate).toMatchObject({
      status: "success",
      httpStatus: 200,
      durationMs: 60,
      eventCount: 4,
    });

    expect(diff.errors.removed.map((event) => event.title)).toEqual([
      "POST /api/orders/1/checkout",
      "POST /api/payments",
      "Payment timeout after 5000ms",
    ]);

    expect(diff.errors.added).toEqual([]);

    expect(diff.removed.map((event) => event.title)).toEqual([
      "Payment timeout after 5000ms",
      "DB: rollback order",
    ]);

    expect(diff.added.map((event) => event.title)).toEqual([
      "DB: commit order",
    ]);

    // The root aligns despite the query string; its status and body differ.
    const root = diff.changed.find(
      (change) => change.original.title === "POST /api/orders/1/checkout",
    );

    expect(root?.kinds).toEqual(
      expect.arrayContaining(["status", "http_status", "response", "timing"]),
    );

    expect(root?.httpStatus).toEqual({
      from: 500,
      to: 200,
    });

    expect(root?.responseChanges.map((change) => change.path)).toEqual([
      "body.ok",
      "body.orderId",
    ]);

    // The root changed only because the payment call did; the payment call
    // is where behaviour first differs.
    expect(diff.firstDivergence).toMatchObject({
      kind: "changed",
      offsetMs: 20,
      event: {
        title: "POST /api/payments",
      },
    });

    expect(diff.timing).toEqual({
      originalMs: 180,
      candidateMs: 60,
      deltaMs: -120,
      verdict: "improved",
    });

    expect(diff.summary).toEqual(
      expect.arrayContaining([
        "Failure removed: Payment timeout after 5000ms",
        "Removed event: DB: rollback order",
        "Added event: DB: commit order",
        "Changed status: POST /api/orders/1/checkout?dryRun=1 (500 → 200)",
        "Latency improved: 180ms → 60ms",
      ]),
    );
  });

  it("points at the new path, not the root, when children were added", () => {
    const failing: Spec[] = [
      {
        id: "root",
        title: "POST /api/checkout",
        status: "error",
        httpStatus: 500,
      },
      {
        id: "cart",
        type: "database.query",
        title: "DB: load cart",
        parent: "root",
        at: 5,
      },
      {
        id: "timeout",
        type: "error",
        title: "Payment timeout",
        status: "error",
        parent: "root",
        at: 70,
      },
    ];

    const succeeding: Spec[] = [
      { id: "root", title: "POST /api/checkout", httpStatus: 200 },
      {
        id: "cart",
        type: "database.query",
        title: "DB: load cart",
        parent: "root",
        at: 5,
      },
      {
        id: "charge",
        type: "agent.action",
        title: "Stripe: charge",
        parent: "root",
        at: 14,
      },
    ];

    const diff = diffExecutions(
      snapshot("a", failing),
      snapshot("b", succeeding),
    );

    expect(diff.firstDivergence).toMatchObject({
      kind: "added",
      offsetMs: 14,
      event: {
        title: "Stripe: charge",
      },
    });
  });

  it("reports a regression with its new failure", () => {
    const diff = diffExecutions(
      snapshot("fix", fixedCheckout),
      snapshot("orig", failingCheckout),
    );

    expect(diff.outcome).toBe("regressed");

    expect(diff.errors.added.map((event) => event.title)).toContain(
      "Payment timeout after 5000ms",
    );

    expect(diff.timing.verdict).toBe("regressed");
  });

  it("distinguishes the same failure from a different one", () => {
    const same = diffExecutions(
      snapshot("a", failingCheckout, { fingerprintId: "fp_timeout" }),
      snapshot("b", failingCheckout, { fingerprintId: "fp_timeout" }),
    );

    expect(same.outcome).toBe("still_failing");
    expect(same.errors.persisted).toBe(3);

    const different = diffExecutions(
      snapshot("a", failingCheckout, { fingerprintId: "fp_timeout" }),
      snapshot("b", failingCheckout, { fingerprintId: "fp_declined" }),
    );

    expect(different.outcome).toBe("different_failure");
  });

  it("aligns repeated sibling events by occurrence", () => {
    const twoQueries: Spec[] = [
      { id: "root", title: "GET /api/report" },
      {
        id: "q1",
        type: "database.query",
        title: "DB: query",
        parent: "root",
        at: 5,
      },
      {
        id: "q2",
        type: "database.query",
        title: "DB: query",
        parent: "root",
        at: 10,
      },
    ];

    const threeQueries: Spec[] = [
      ...twoQueries,
      {
        id: "q3",
        type: "database.query",
        title: "DB: query",
        parent: "root",
        at: 15,
      },
    ];

    const diff = diffExecutions(
      snapshot("a", twoQueries),
      snapshot("b", threeQueries),
    );

    expect(diff.outcome).toBe("behavior_changed");
    expect(diff.unchangedCount).toBe(3);
    expect(diff.added).toHaveLength(1);
    expect(diff.firstDivergence).toMatchObject({
      kind: "added",
      offsetMs: 15,
    });
  });

  it("does not treat timing noise as a behaviour change", () => {
    const slow: Spec[] = [
      { id: "root", title: "GET /api/health", duration: 100 },
    ];
    const jitter: Spec[] = [
      { id: "root", title: "GET /api/health", duration: 104 },
    ];

    const diff = diffExecutions(snapshot("a", slow), snapshot("b", jitter));

    expect(diff.outcome).toBe("unchanged");
    expect(diff.timing.verdict).toBe("unchanged");
    expect(diff.changed).toEqual([]);
  });

  it("reports a significant slowdown without calling it divergence", () => {
    const fast: Spec[] = [
      { id: "root", title: "GET /api/health", duration: 20 },
    ];
    const slow: Spec[] = [
      { id: "root", title: "GET /api/health", duration: 200 },
    ];

    const diff = diffExecutions(snapshot("a", fast), snapshot("b", slow));

    expect(diff.outcome).toBe("unchanged");
    expect(diff.firstDivergence).toBeNull();
    expect(diff.changed[0].kinds).toEqual(["timing"]);
    expect(diff.summary).toEqual(["Latency regressed: 20ms → 200ms"]);
  });

  it("reports request payload changes", () => {
    const diff = diffExecutions(
      snapshot("a", [
        { id: "root", title: "POST /api/pay", payload: { amount: 10 } },
      ]),
      snapshot("b", [
        { id: "root", title: "POST /api/pay", payload: { amount: 0 } },
      ]),
    );

    expect(diff.changed[0].payloadChanges).toEqual([
      {
        path: "payload.amount",
        original: 10,
        replay: 0,
        type: "changed",
      },
    ]);
  });

  it("caps long summaries", () => {
    const many = (count: number): Spec[] => [
      { id: "root", title: "GET /api/batch" },
      ...Array.from({ length: count }, (_, index) => ({
        id: `job${index}`,
        type: "command" as const,
        title: `job ${String.fromCharCode(97 + index)}`,
        parent: "root",
        at: index + 1,
      })),
    ];

    const diff = diffExecutions(snapshot("a", many(0)), snapshot("b", many(8)));

    const addedLines = diff.summary.filter((line) =>
      line.startsWith("Added event"),
    );

    expect(addedLines).toHaveLength(6);
    expect(addedLines[5]).toBe("Added event: +3 more");
  });
});
