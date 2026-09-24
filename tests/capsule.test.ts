import { describe, expect, it } from "vitest";

import {
  buildCapsule,
  canonicalJson,
  CAPSULE_VERSION,
  validateCapsule,
  type Capsule,
} from "@/lib/capsule";
import type { EventEdge } from "@/lib/event-graph";
import type { RewindEvent } from "@/lib/mock-events";

const execution = {
  id: "exe_capsule_test",
  startedAt: "2026-09-01T10:00:00.000Z",
  endedAt: "2026-09-01T10:00:00.180Z",
  status: "error" as const,
  traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
  rootEventId: "evt_root",
  environment: "production",
  fingerprintId: "fp_0123456789abcdef",
};

const events: RewindEvent[] = [
  {
    id: "evt_dep",
    timestamp: "2026-09-01T10:00:00.020Z",
    type: "http.dependency",
    title: "POST https://api.stripe.test/v1/charges",
    status: "error",
    duration: "150ms",
    executionId: execution.id,
    parentEventId: "evt_root",
    metadata: {
      response: {
        status: 504,
        statusText: "Gateway Timeout",
        headers: {
          "content-type": "application/json",
        },
        body: {
          error: "timeout",
        },
      },
    },
  },
  {
    id: "evt_root",
    timestamp: "2026-09-01T10:00:00.000Z",
    type: "http.request",
    title: "POST /api/orders/1/checkout",
    status: "error",
    duration: "180ms",
    executionId: execution.id,
    parentEventId: null,
    payload: {
      amount: 5000,
    },
    metadata: {
      method: "POST",
      path: "/api/orders/1/checkout",
      headers: {
        "content-type": "application/json",
        authorization: "[REDACTED]",
      },
      response: {
        status: 502,
      },
    },
  },
];

const edges: EventEdge[] = [
  {
    id: "edg_1",
    executionId: execution.id,
    fromEventId: "evt_root",
    toEventId: "evt_dep",
    type: "parent_of",
    origin: "explicit",
    confidence: 1,
    createdAt: "2026-09-01T10:00:00.020Z",
  },
];

function build() {
  return buildCapsule({
    execution,
    events,
    edges,
    createdAt: "2026-09-02T00:00:00.000Z",
  });
}

/** What an exported capsule looks like after being written to disk. */
function roundTrip(capsule: Capsule): Capsule {
  return JSON.parse(JSON.stringify(capsule, null, 2));
}

describe("canonicalJson", () => {
  it("ignores key order and undefined values", () => {
    expect(
      canonicalJson({ b: 1, a: { d: [1, { f: 2, e: 3 }], c: undefined } }),
    ).toBe(canonicalJson({ a: { d: [1, { e: 3, f: 2 }] }, b: 1 }));
  });
});

describe("buildCapsule", () => {
  it("builds a versioned capsule identified by its digest", () => {
    const capsule = build();

    expect(capsule.format).toBe("rewind.capsule");
    expect(capsule.version).toBe(CAPSULE_VERSION);
    expect(capsule.integrity.algorithm).toBe("sha256");
    expect(capsule.integrity.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(capsule.id).toBe(`cap_${capsule.integrity.digest.slice(0, 16)}`);
  });

  it("orders events chronologically and records the expected outcome", () => {
    const capsule = build();

    expect(capsule.events.map((event) => event.id)).toEqual([
      "evt_root",
      "evt_dep",
    ]);

    expect(capsule.expected).toEqual({
      status: "error",
      httpStatus: 502,
      fingerprintId: "fp_0123456789abcdef",
    });
  });

  it("carries replay instructions with recorded dependency fixtures", () => {
    expect(build().replay).toEqual({
      eventId: "evt_root",
      method: "POST",
      path: "/api/orders/1/checkout",
      headers: {
        "content-type": "application/json",
      },
      payload: {
        amount: 5000,
      },
      dependencyMode: "recorded",
      fixtures: [
        {
          key: "POST https://api.stripe.test/v1/charges",
          title: "POST https://api.stripe.test/v1/charges",
          status: 504,
          statusText: "Gateway Timeout",
          headers: {
            "content-type": "application/json",
          },
          body: {
            error: "timeout",
          },
          truncated: false,
        },
      ],
    });
  });

  it("produces the same digest for the same content", () => {
    expect(build().integrity.digest).toBe(build().integrity.digest);
  });
});

describe("validateCapsule", () => {
  it("accepts an exported capsule after it was written to disk", () => {
    const result = validateCapsule(roundTrip(build()));

    expect("capsule" in result).toBe(true);
  });

  it("rejects a capsule edited after export", () => {
    const capsule = roundTrip(build());

    capsule.events[0].title = "POST /api/something-else";

    expect(validateCapsule(capsule)).toEqual({
      errors: [
        "Integrity check failed: the capsule was modified after it was exported.",
      ],
    });
  });

  it("rejects a capsule whose expected outcome was changed", () => {
    const capsule = roundTrip(build());

    capsule.expected.status = "success";

    expect("errors" in validateCapsule(capsule)).toBe(true);
  });

  it("rejects a swapped capsule id", () => {
    const capsule = roundTrip(build());

    capsule.id = "cap_0000000000000000";

    expect(validateCapsule(capsule)).toEqual({
      errors: ["The capsule id does not match its digest."],
    });
  });

  it.each([
    ["a non-object", "nope", "must be a JSON object"],
    ["a wrong format", { ...build(), format: "other" }, "format must be"],
    [
      "a future version",
      { ...build(), version: 2 },
      "Unsupported capsule version 2",
    ],
    [
      "an invalid execution id",
      { ...build(), execution: { ...execution, id: "bad id" } },
      "execution must have",
    ],
    ["no events", { ...build(), events: [] }, "non-empty array"],
    [
      "an event from another execution",
      {
        ...build(),
        events: [{ ...build().events[0], executionId: "exe_other" }],
      },
      "does not belong",
    ],
    [
      "a duplicated event",
      { ...build(), events: [build().events[0], build().events[0]] },
      "repeats the id",
    ],
    [
      "an edge to a missing event",
      {
        ...build(),
        edges: [{ ...edges[0], toEventId: "evt_missing" }],
      },
      "does not reference events",
    ],
    [
      "a missing root event",
      { ...build(), execution: { ...execution, rootEventId: "evt_missing" } },
      "rootEventId is not one of",
    ],
    [
      "missing integrity",
      { ...build(), integrity: undefined },
      "integrity must carry",
    ],
  ])("rejects %s", (_label, input, message) => {
    const result = validateCapsule(input);

    expect("errors" in result && result.errors.join(" ")).toContain(message);
  });
});
