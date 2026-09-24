import { getExecutionContext } from "@/lib/execution-context";
import type { EventStatus } from "@/lib/mock-events";
import { redactHeaders, redactJson, redactUrl } from "@/lib/redaction";
import { rewind } from "@/lib/rewind";

/**
 * Bodies larger than this are recorded truncated. Rewind never buffers a
 * whole unbounded stream just to record it.
 */
export const MAX_RECORDED_BODY_BYTES = 64 * 1024;

type RecordedBody = {
  body: unknown;
  sizeBytes: number;
  truncated: boolean;
};

const STREAMING_CONTENT_TYPES = ["text/event-stream", "application/x-ndjson"];

function isRecordableContentType(contentType: string | null) {
  if (!contentType) {
    return true;
  }

  if (STREAMING_CONTENT_TYPES.some((type) => contentType.includes(type))) {
    return false;
  }

  return (
    contentType.includes("json") ||
    contentType.startsWith("text/") ||
    contentType.includes("x-www-form-urlencoded") ||
    contentType.includes("xml")
  );
}

async function readBounded(
  stream: ReadableStream<Uint8Array> | null,
): Promise<{ text: string; sizeBytes: number; truncated: boolean }> {
  if (!stream) {
    return {
      text: "",
      sizeBytes: 0,
      truncated: false,
    };
  }

  const reader = stream.getReader();

  const chunks: Uint8Array[] = [];

  let sizeBytes = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    sizeBytes += value.byteLength;

    if (sizeBytes > MAX_RECORDED_BODY_BYTES) {
      truncated = true;
      chunks.push(
        value.subarray(
          0,
          value.byteLength - (sizeBytes - MAX_RECORDED_BODY_BYTES),
        ),
      );
      // Cancelling one branch of a tee settles only once the other branch
      // (the caller's) is cancelled too, so it must not be awaited.
      reader.cancel().catch(() => {});
      break;
    }

    chunks.push(value);
  }

  const buffer = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
  );

  let offset = 0;

  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    text: new TextDecoder().decode(buffer),
    sizeBytes,
    truncated,
  };
}

async function recordBody(
  source: Request | Response,
): Promise<RecordedBody | undefined> {
  const contentType = source.headers.get("content-type");

  if (!source.body || !isRecordableContentType(contentType)) {
    return undefined;
  }

  try {
    const { text, sizeBytes, truncated } = await readBounded(
      source.clone().body,
    );

    if (!text) {
      return undefined;
    }

    let body: unknown = text;

    if (!truncated && contentType?.includes("json")) {
      try {
        body = redactJson(JSON.parse(text));
      } catch {
        // Keep the raw text.
      }
    }

    return {
      body,
      sizeBytes,
      truncated,
    };
  } catch {
    return undefined;
  }
}

/**
 * Title for a dependency call: method plus URL without query or fragment,
 * e.g. "POST https://api.stripe.com/v1/charges".
 */
export function dependencyTitle(method: string, url: URL) {
  return `${method} ${url.origin}${url.pathname}`;
}

/**
 * Drop-in replacement for fetch that records the call as an
 * `http.dependency` event. Inside an execution (e.g. a handler wrapped with
 * withRewindCapture) the dependency becomes a child of the current event.
 *
 * Recording never changes what the caller receives, and a recording
 * failure never breaks the call.
 *
 * During a Rewind replay the call follows the replay plan instead: it is
 * answered from the original execution's recording, overridden by an
 * experiment, blocked, or (only when the replay opts in) sent live.
 */
export async function rewindFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(input, init);

  const url = new URL(request.url);

  const method = request.method.toUpperCase();

  const timestamp = new Date().toISOString();

  const startTime = performance.now();

  const requestBody = await recordBody(request);

  const title = dependencyTitle(method, url);

  const decision = getExecutionContext()?.replay?.decide(title) ?? {
    kind: "live" as const,
  };

  let response: Response | undefined;
  let failure: unknown;

  if (decision.kind === "respond") {
    if (decision.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, decision.delayMs));
    }

    response = decision.response;
  } else if (decision.kind === "fail") {
    failure = decision.error;
  } else {
    try {
      response = await fetch(request);
    } catch (error) {
      failure = error;
    }
  }

  const durationMs = Math.round(performance.now() - startTime);

  const responseBody = response ? await recordBody(response) : undefined;

  const status: EventStatus =
    failure || !response || response.status >= 500 ? "error" : "success";

  try {
    await rewind.capture({
      type: "http.dependency",
      title,
      status,
      timestamp,
      duration: `${durationMs}ms`,
      source: "rewind-fetch",
      metadata: {
        environment: process.env.NODE_ENV ?? "development",
        dependency: {
          kind: "http",
          mode: decision.kind === "live" ? "live" : decision.mode,
          method,
          url: redactUrl(url),
          host: url.host,
        },
        headers: redactHeaders(request.headers),
        ...(requestBody
          ? {
              requestSizeBytes: requestBody.sizeBytes,
              requestTruncated: requestBody.truncated,
            }
          : {}),
        ...(response
          ? {
              response: {
                status: response.status,
                statusText: response.statusText,
                headers: redactHeaders(response.headers),
                ...(responseBody
                  ? {
                      body: responseBody.body,
                      sizeBytes: responseBody.sizeBytes,
                      truncated: responseBody.truncated,
                    }
                  : {}),
              },
            }
          : {}),
        ...(failure
          ? {
              error:
                failure instanceof Error ? failure.message : String(failure),
            }
          : {}),
      },
      payload: requestBody?.body,
    });
  } catch (captureError) {
    console.error("Rewind dependency capture failed:", captureError);
  }

  if (!response) {
    throw failure;
  }

  return response;
}
