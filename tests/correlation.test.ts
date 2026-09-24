import { describe, expect, it } from "vitest";

import { extractCorrelationIds, parseTraceparent } from "@/lib/correlation";

const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";

const SPAN_ID = "00f067aa0ba902b7";

const TRACEPARENT = `00-${TRACE_ID}-${SPAN_ID}-01`;

describe("parseTraceparent", () => {
  it("parses a valid W3C traceparent into trace and span IDs", () => {
    expect(parseTraceparent(TRACEPARENT)).toEqual({
      traceId: TRACE_ID,
      spanId: SPAN_ID,
    });
  });

  it("ignores surrounding whitespace", () => {
    expect(parseTraceparent(`  ${TRACEPARENT}  `)).toEqual({
      traceId: TRACE_ID,
      spanId: SPAN_ID,
    });
  });

  it("accepts future versions with additional fields", () => {
    expect(parseTraceparent(`01-${TRACE_ID}-${SPAN_ID}-01-extra`)).toEqual({
      traceId: TRACE_ID,
      spanId: SPAN_ID,
    });
  });

  it.each([
    ["missing value", undefined],
    ["null value", null],
    ["empty string", ""],
    ["random text", "not-a-traceparent"],
    ["forbidden version ff", `ff-${TRACE_ID}-${SPAN_ID}-01`],
    ["all-zero trace ID", `00-${"0".repeat(32)}-${SPAN_ID}-01`],
    ["all-zero span ID", `00-${TRACE_ID}-${"0".repeat(16)}-01`],
    ["short trace ID", `00-${TRACE_ID.slice(1)}-${SPAN_ID}-01`],
    ["short span ID", `00-${TRACE_ID}-${SPAN_ID.slice(1)}-01`],
    ["uppercase hex", `00-${TRACE_ID.toUpperCase()}-${SPAN_ID}-01`],
    ["non-hex characters", `00-${"z".repeat(32)}-${SPAN_ID}-01`],
    ["version 00 with extra fields", `${TRACEPARENT}-extra`],
    ["missing flags", `00-${TRACE_ID}-${SPAN_ID}`],
  ])("returns null for %s", (_label, value) => {
    expect(parseTraceparent(value)).toBeNull();
  });
});

describe("extractCorrelationIds", () => {
  it("extracts all five x-* correlation headers", () => {
    const headers = new Headers({
      "X-Request-Id": "req_123",
      "X-Trace-Id": "trace_123",
      "X-Span-Id": "span_123",
      "X-Session-Id": "sess_123",
      "X-User-Id": "user_123",
    });

    expect(extractCorrelationIds(headers)).toEqual({
      requestId: "req_123",
      traceId: "trace_123",
      spanId: "span_123",
      sessionId: "sess_123",
      userId: "user_123",
    });
  });

  it("derives trace and span IDs from a valid traceparent", () => {
    const headers = new Headers({
      traceparent: TRACEPARENT,
    });

    const ids = extractCorrelationIds(headers);

    expect(ids).toEqual({
      traceId: TRACE_ID,
      spanId: SPAN_ID,
    });

    expect(ids.traceId).not.toBe(TRACEPARENT);
  });

  it("prefers explicit x-trace-id and x-span-id over traceparent", () => {
    const headers = new Headers({
      traceparent: TRACEPARENT,
      "x-trace-id": "trace_explicit",
      "x-span-id": "span_explicit",
    });

    expect(extractCorrelationIds(headers)).toEqual({
      traceId: "trace_explicit",
      spanId: "span_explicit",
    });
  });

  it("does not mix a traceparent span ID with a different explicit trace ID", () => {
    const headers = new Headers({
      traceparent: TRACEPARENT,
      "x-trace-id": "trace_explicit",
    });

    expect(extractCorrelationIds(headers)).toEqual({
      traceId: "trace_explicit",
    });
  });

  it("uses the traceparent span ID when x-trace-id matches the traceparent", () => {
    const headers = new Headers({
      traceparent: TRACEPARENT,
      "x-trace-id": TRACE_ID,
    });

    expect(extractCorrelationIds(headers)).toEqual({
      traceId: TRACE_ID,
      spanId: SPAN_ID,
    });
  });

  it("falls back to x-* headers when traceparent is invalid", () => {
    const headers = new Headers({
      traceparent: "garbage",
      "x-trace-id": "trace_fallback",
      "x-span-id": "span_fallback",
    });

    expect(extractCorrelationIds(headers)).toEqual({
      traceId: "trace_fallback",
      spanId: "span_fallback",
    });
  });

  it("never stores an invalid traceparent as the trace ID", () => {
    const headers = new Headers({
      traceparent: "garbage",
    });

    expect(extractCorrelationIds(headers)).toEqual({});
  });

  it("ignores empty and oversized header values", () => {
    const headers = new Headers({
      "x-request-id": "   ",
      "x-user-id": "u".repeat(257),
      "x-session-id": " sess_trimmed ",
    });

    expect(extractCorrelationIds(headers)).toEqual({
      sessionId: "sess_trimmed",
    });
  });

  it("returns an empty object when no correlation headers exist", () => {
    expect(extractCorrelationIds(new Headers())).toEqual({});
  });
});
