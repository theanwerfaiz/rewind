import { NextRequest } from "next/server";

import { extractCorrelationIds } from "@/lib/correlation";
import {
  DependencyReplayer,
  type ReplayPlan,
} from "@/lib/dependency-replay";
import type { RewindHttpMetadata } from "@/lib/event-metadata";
import {
  createEventId,
  createExecutionId,
  getExecutionContext,
  runInExecution,
} from "@/lib/execution-context";
import { getRewindOrigin, rewind, rewindAuthHeaders } from "@/lib/rewind";

type RouteHandler = (request: NextRequest) => Promise<Response>;

const UUID_SUFFIX = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const REPLAY_ID_PATTERN = new RegExp(`^replay_${UUID_SUFFIX}$`);

const EXECUTION_ID_PATTERN = new RegExp(`^exe_${UUID_SUFFIX}$`);

/**
 * A Rewind replay pre-assigns the execution its request will be captured
 * as, so the experiment can be compared with the original. Honoured only
 * for well-formed replay requests.
 */
function getReplayIdentity(headers: Headers) {
  const replayId = headers.get("x-rewind-replay-id");

  const executionId = headers.get("x-rewind-execution-id");

  if (
    replayId &&
    executionId &&
    REPLAY_ID_PATTERN.test(replayId) &&
    EXECUTION_ID_PATTERN.test(executionId)
  ) {
    return {
      replayId,
      executionId,
    };
  }

  return undefined;
}

/**
 * Loads how dependency calls should behave during a replay. If the plan
 * cannot be loaded, every dependency call is blocked: a replay must never
 * fall back to live side effects by accident.
 */
async function loadReplayer(replayId: string) {
  try {
    const response = await fetch(
      `${getRewindOrigin()}/api/replays/${replayId}/plan`,
      { headers: rewindAuthHeaders() },
    );

    if (response.ok) {
      const { plan } = (await response.json()) as { plan: ReplayPlan };

      return new DependencyReplayer(plan);
    }
  } catch (error) {
    console.error("Rewind replay plan unavailable:", error);
  }

  return new DependencyReplayer({
    replayId,
    mode: "blocked",
    fixtures: [],
    dependencyMutations: [],
  });
}

type HttpEventIdentity = {
  eventId: string;
  executionId: string;
  parentEventId: string | null;
  startedAt: string;
};

const REDACTED_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
]);

function captureHeaders(headersSource: Headers) {
  const headers: Record<string, string> = {};

  headersSource.forEach((value, key) => {
    headers[key] = REDACTED_HEADERS.has(key.toLowerCase())
      ? "[REDACTED]"
      : value;
  });

  return headers;
}

function getContentLength(headers: Headers) {
  const contentLength = headers.get("content-length");

  if (!contentLength) {
    return undefined;
  }

  const size = Number(contentLength);

  return Number.isFinite(size) && size >= 0 ? size : undefined;
}

function getByteSize(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

async function readRequestPayload(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return undefined;
  }

  try {
    const clonedRequest = request.clone();

    return await clonedRequest.json();
  } catch {
    return undefined;
  }
}

async function readResponseBody(response: Response) {
  try {
    const contentType = response.headers.get("content-type") ?? "";

    const clonedResponse = response.clone();

    const text = await clonedResponse.text();

    if (!text) {
      return {
        body: undefined,
        sizeBytes: 0,
      };
    }

    const sizeBytes = getByteSize(text);

    if (contentType.includes("application/json")) {
      try {
        return {
          body: JSON.parse(text),
          sizeBytes,
        };
      } catch {
        return {
          body: text,
          sizeBytes,
        };
      }
    }

    return {
      body: text,
      sizeBytes,
    };
  } catch {
    return {
      body: undefined,
      sizeBytes: undefined,
    };
  }
}

async function captureHttpEvent(
  identity: HttpEventIdentity,
  request: NextRequest,
  response: Response | null,
  payload: unknown,
  durationMs: number,
  error?: unknown,
) {
  const status = response?.status ?? 500;

  const eventStatus = error || status >= 400 ? "error" : "success";

  const path = request.nextUrl.pathname + request.nextUrl.search;

  const method = request.method.toUpperCase();

  const errorMessage = error instanceof Error ? error.message : undefined;

  const responseData = response ? await readResponseBody(response) : undefined;

  const responseHeaders = response
    ? captureHeaders(response.headers)
    : undefined;

  const requestContentType = request.headers.get("content-type") ?? undefined;

  const requestSizeBytes =
    getContentLength(request.headers) ??
    (payload !== undefined ? getByteSize(JSON.stringify(payload)) : undefined);

  const userAgent = request.headers.get("user-agent") ?? undefined;

  const responseContentType =
    response?.headers.get("content-type") ?? undefined;

  const responseSizeBytes =
    responseData?.sizeBytes ??
    (response ? getContentLength(response.headers) : undefined);

  const statusText =
    response?.statusText ||
    (status === 200
      ? "OK"
      : status === 201
        ? "Created"
        : status === 204
          ? "No Content"
          : status >= 500
            ? "Internal Server Error"
            : "HTTP Response");

  const metadata: RewindHttpMetadata = {
    environment: process.env.NODE_ENV ?? "development",

    method,

    path,

    ...(requestContentType
      ? {
          contentType: requestContentType,
        }
      : {}),

    ...(requestSizeBytes !== undefined
      ? {
          requestSizeBytes,
        }
      : {}),

    ...(userAgent
      ? {
          userAgent,
        }
      : {}),

    headers: captureHeaders(request.headers),

    response: {
      status,

      statusText,

      ...(responseContentType
        ? {
            contentType: responseContentType,
          }
        : {}),

      ...(responseSizeBytes !== undefined
        ? {
            sizeBytes: responseSizeBytes,
          }
        : {}),

      ...(responseHeaders
        ? {
            headers: responseHeaders,
          }
        : {}),

      ...(responseData?.body !== undefined
        ? {
            body: responseData.body,
          }
        : {}),
    },

    ...(errorMessage
      ? {
          error: errorMessage,
        }
      : {}),
  };

  try {
    await rewind.capture({
      id: identity.eventId,
      timestamp: identity.startedAt,
      executionId: identity.executionId,
      parentEventId: identity.parentEventId,
      type: "http.request",
      title: `${method} ${path}`,
      status: eventStatus,
      duration: `${durationMs}ms`,
      source: "next-http",
      ...extractCorrelationIds(request.headers),
      metadata,
      payload,
    });
  } catch (captureError) {
    console.error("Rewind HTTP capture failed:", captureError);
  }
}

export function withRewindCapture(handler: RouteHandler): RouteHandler {
  return async (request) => {
    const startTime = performance.now();

    // A request handled inside another execution joins it as a child;
    // otherwise it is the root of a new execution.
    const parent = getExecutionContext();

    const replayIdentity = parent
      ? undefined
      : getReplayIdentity(request.headers);

    const identity: HttpEventIdentity = {
      eventId: createEventId(),
      executionId:
        parent?.executionId ??
        replayIdentity?.executionId ??
        createExecutionId(),
      parentEventId: parent?.eventId ?? null,
      startedAt: new Date().toISOString(),
    };

    const replay =
      parent?.replay ??
      (replayIdentity ? await loadReplayer(replayIdentity.replayId) : undefined);

    const payload = await readRequestPayload(request);

    let response: Response;

    try {
      response = await runInExecution(
        {
          executionId: identity.executionId,
          eventId: identity.eventId,
          replay,
        },
        () => handler(request),
      );
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);

      await captureHttpEvent(
        identity,
        request,
        null,
        payload,
        durationMs,
        error,
      );

      throw error;
    }

    const durationMs = Math.round(performance.now() - startTime);

    await captureHttpEvent(identity, request, response, payload, durationMs);

    return response;
  };
}
