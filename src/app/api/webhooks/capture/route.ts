import { NextRequest, NextResponse } from "next/server";

import { extractCorrelationIds } from "@/lib/correlation";
import {
  createExecutionId,
  getExecutionContext,
} from "@/lib/execution-context";
import { rewind } from "@/lib/rewind";

export const runtime = "nodejs";

const REDACTED_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
]);

function captureHeaders(request: NextRequest) {
  const headers: Record<string, string> = {};

  request.headers.forEach((value, key) => {
    headers[key] = REDACTED_HEADERS.has(key.toLowerCase())
      ? "[REDACTED]"
      : value;
  });

  return headers;
}

export async function POST(request: NextRequest) {
  try {
    const correlationIds = extractCorrelationIds(request.headers);

    const requestId = correlationIds.requestId ?? `req_${crypto.randomUUID()}`;

    const payload = await request.json();

    const headers = captureHeaders(request);

    const event = await rewind.capture({
      type: "webhook.received",

      title: "Webhook received",

      status: "success",

      source: "webhook",

      ...correlationIds,

      requestId,

      // A webhook opens a new execution unless it arrives inside one.
      executionId: getExecutionContext()?.executionId ?? createExecutionId(),

      metadata: {
        environment: process.env.NODE_ENV ?? "development",

        method: request.method,

        path: request.nextUrl.pathname + request.nextUrl.search,

        headers,
      },

      payload,
    });

    return NextResponse.json(
      {
        success: true,
        event,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error("Webhook capture failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Webhook capture failed.",
      },
      {
        status: 500,
      },
    );
  }
}
