import { NextRequest } from "next/server";

import type { RewindHttpMetadata } from "@/lib/event-metadata";
import { rewind } from "@/lib/rewind";

type RouteHandler = (request: NextRequest) => Promise<Response>;

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
      type: "http.request",
      title: `${method} ${path}`,
      status: eventStatus,
      duration: `${durationMs}ms`,
      source: "next-http",
      requestId: request.headers.get("x-request-id") ?? undefined,
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

    const payload = await readRequestPayload(request);

    let response: Response;

    try {
      response = await handler(request);
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);

      await captureHttpEvent(request, null, payload, durationMs, error);

      throw error;
    }

    const durationMs = Math.round(performance.now() - startTime);

    await captureHttpEvent(request, response, payload, durationMs);

    return response;
  };
}
