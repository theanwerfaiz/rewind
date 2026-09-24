import { NextRequest } from "next/server";

import { formatSseEvent, pollExecutions } from "@/lib/live";

export const runtime = "nodejs";

const POLL_MS = 1000;

const HEARTBEAT_MS = 15_000;

/**
 * Server-Sent Events: new and changed executions as they are captured.
 * Polls SQLite once a second per connection; the query is indexed by time
 * and returns nothing when idle.
 */
export async function GET(request: NextRequest) {
  const since = request.nextUrl.searchParams.get("since");

  let cursor =
    since && !Number.isNaN(Date.parse(since)) ? since : new Date().toISOString();

  const encoder = new TextEncoder();

  let poll: ReturnType<typeof setInterval> | undefined;

  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stop = () => {
    clearInterval(poll);
    clearInterval(heartbeat);
  };

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          stop();
        }
      };

      send(`retry: 3000\n${formatSseEvent("ready", { cursor })}`);

      poll = setInterval(() => {
        try {
          const next = pollExecutions(cursor);

          cursor = next.cursor;

          for (const execution of next.executions) {
            send(formatSseEvent("execution", execution));
          }
        } catch (error) {
          console.error("Live stream poll failed:", error);
        }
      }, POLL_MS);

      heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      request.signal.addEventListener("abort", () => {
        stop();

        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },

    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
