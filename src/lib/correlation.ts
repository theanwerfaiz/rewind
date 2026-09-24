export type CorrelationIds = {
  traceId?: string;
  spanId?: string;
  requestId?: string;
  sessionId?: string;
  userId?: string;
};

export type ParsedTraceparent = {
  traceId: string;
  spanId: string;
};

export const CORRELATION_HEADERS = {
  requestId: "x-request-id",
  traceId: "x-trace-id",
  spanId: "x-span-id",
  sessionId: "x-session-id",
  userId: "x-user-id",
  traceparent: "traceparent",
} as const;

const MAX_CORRELATION_ID_LENGTH = 256;

const TRACEPARENT_PATTERN =
  /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(-.*)?$/;

/**
 * Parses a W3C Trace Context `traceparent` header value.
 *
 * Format: `{version}-{trace-id}-{parent-id}-{trace-flags}`
 * https://www.w3.org/TR/trace-context/#traceparent-header
 *
 * Returns null for anything invalid so callers can fall back safely.
 */
export function parseTraceparent(
  value: string | null | undefined,
): ParsedTraceparent | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(TRACEPARENT_PATTERN);

  if (!match) {
    return null;
  }

  const [, version, traceId, spanId, , extra] = match;

  // Version ff is forbidden.
  if (version === "ff") {
    return null;
  }

  // Version 00 has exactly four fields. Future versions may append more.
  if (version === "00" && extra !== undefined) {
    return null;
  }

  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) {
    return null;
  }

  return {
    traceId,
    spanId,
  };
}

function readHeader(headers: Headers, name: string) {
  const value = headers.get(name)?.trim();

  if (!value || value.length > MAX_CORRELATION_ID_LENGTH) {
    return undefined;
  }

  return value;
}

/**
 * Extracts execution correlation IDs from request headers.
 *
 * Explicit `x-trace-id` / `x-span-id` headers take precedence over a
 * `traceparent` header. The traceparent span ID is only used when it belongs
 * to the same trace as the resolved trace ID.
 */
export function extractCorrelationIds(headers: Headers): CorrelationIds {
  const traceparent = parseTraceparent(
    headers.get(CORRELATION_HEADERS.traceparent),
  );

  const explicitTraceId = readHeader(headers, CORRELATION_HEADERS.traceId);

  const explicitSpanId = readHeader(headers, CORRELATION_HEADERS.spanId);

  const traceId = explicitTraceId ?? traceparent?.traceId;

  const spanId =
    explicitSpanId ??
    (traceparent && traceId === traceparent.traceId
      ? traceparent.spanId
      : undefined);

  const ids: CorrelationIds = {
    traceId,
    spanId,
    requestId: readHeader(headers, CORRELATION_HEADERS.requestId),
    sessionId: readHeader(headers, CORRELATION_HEADERS.sessionId),
    userId: readHeader(headers, CORRELATION_HEADERS.userId),
  };

  return Object.fromEntries(
    Object.entries(ids).filter(([, value]) => value !== undefined),
  ) as CorrelationIds;
}
