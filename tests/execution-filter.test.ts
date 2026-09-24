import { describe, expect, it } from "vitest";

import {
  matchesExecutionFilter,
  parseExecutionFilter,
  type FilterableExecution,
} from "@/lib/execution-filter";

const NOW = Date.parse("2026-09-24T12:00:00.000Z");

function execution(overrides: Partial<FilterableExecution> = {}): FilterableExecution {
  return {
    id: "exe_1111",
    status: "success",
    startedAt: "2026-09-24T11:30:00.000Z",
    endedAt: "2026-09-24T11:30:00.120Z",
    environment: "production",
    rootTitle: "POST /api/orders/7/checkout",
    fingerprintId: null,
    capsuleId: null,
    isReplay: false,
    ...overrides,
  };
}

function matches(query: string, target: FilterableExecution) {
  return matchesExecutionFilter(target, parseExecutionFilter(query), NOW);
}

describe("parseExecutionFilter", () => {
  it("parses keys, negation, quotes and free text", () => {
    const parsed = parseExecutionFilter(
      'status:error -is:replay endpoint:"/api/orders" since:24h duration:>100ms Checkout',
    );

    expect(parsed.errors).toEqual([]);

    expect(parsed.terms).toEqual([
      { key: "status", value: "error", negate: false },
      { key: "is", value: "replay", negate: true },
      { key: "endpoint", value: "/api/orders", negate: false },
      { key: "since", ms: 86_400_000, negate: false },
      { key: "duration", comparison: { op: ">", ms: 100 }, negate: false },
      { key: "text", value: "checkout", negate: false },
    ]);
  });

  it("reports what it cannot understand instead of guessing", () => {
    const parsed = parseExecutionFilter("status:maybe colour:red since:soon duration:5 env:");

    expect(parsed.terms).toEqual([]);
    expect(parsed.errors).toHaveLength(5);
  });

  it("returns no terms for an empty query", () => {
    expect(parseExecutionFilter("   ")).toEqual({ terms: [], errors: [] });
  });
});

describe("matchesExecutionFilter", () => {
  it("matches everything with no terms", () => {
    expect(matches("", execution())).toBe(true);
  });

  it("filters by status and replay flag", () => {
    const failedReplay = execution({ status: "error", isReplay: true });

    expect(matches("status:error", failedReplay)).toBe(true);
    expect(matches("status:error -is:replay", failedReplay)).toBe(false);
    expect(matches("is:failed", failedReplay)).toBe(false);
    expect(matches("is:failed", execution({ status: "error" }))).toBe(true);
  });

  it("filters by endpoint, environment and fingerprint prefix", () => {
    const target = execution({ fingerprintId: "fp_12c4b153" });

    expect(matches("endpoint:/checkout env:production", target)).toBe(true);
    expect(matches("env:staging", target)).toBe(false);
    expect(matches("fp:12c4", target)).toBe(true);
    expect(matches("fp:fp_12c4", target)).toBe(true);
    expect(matches("fp:9999", target)).toBe(false);
  });

  it("filters by age and duration", () => {
    const target = execution();

    expect(matches("since:1h", target)).toBe(true);
    expect(matches("since:10m", target)).toBe(false);
    expect(matches("duration:>100ms", target)).toBe(true);
    expect(matches("duration:<100ms", target)).toBe(false);
  });

  it("matches free text against the title and the ID prefix", () => {
    expect(matches("checkout", execution())).toBe(true);
    expect(matches("exe_11", execution())).toBe(true);
    expect(matches("refund", execution())).toBe(false);
  });
});
