import { afterEach, describe, expect, it } from "vitest";

import { NextRequest } from "next/server";

import { POST } from "@/app/api/events/route";
import { GET as streamRoute } from "@/app/api/stream/route";
import db from "@/lib/db";
import { formatSseEvent, pollExecutions } from "@/lib/live";

const createdEventIds: string[] = [];

const createdExecutionIds: string[] = [];

afterEach(() => {
  for (const id of createdEventIds.splice(0)) {
    db.prepare(`DELETE FROM event_edges WHERE to_event_id = ?`).run(id);
    db.prepare(`DELETE FROM events WHERE id = ?`).run(id);
  }

  for (const id of createdExecutionIds.splice(0)) {
    db.prepare(`DELETE FROM executions WHERE id = ?`).run(id);
  }
});

async function capture(executionId: string, status: "success" | "error") {
  const response = await POST(
    new NextRequest("http://localhost:3000/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "http.request",
        title: "POST /api/live",
        status,
        executionId,
      }),
    }),
  );

  const data = await response.json();

  createdEventIds.push(data.event.id);

  if (!createdExecutionIds.includes(executionId)) {
    createdExecutionIds.push(executionId);
  }
}

describe("live stream", () => {
  it("formats one SSE message per event", () => {
    expect(formatSseEvent("execution", { id: "exe_1", title: "a\nb" })).toBe(
      'event: execution\ndata: {"id":"exe_1","title":"a\\nb"}\n\n',
    );
  });

  it("returns changes after the cursor exactly once", async () => {
    const cursor = new Date(Date.now() - 1).toISOString();

    const executionId = `exe_live_${Date.now()}`;

    await capture(executionId, "success");

    const first = pollExecutions(cursor);

    expect(first.executions.map((execution) => execution.id)).toContain(executionId);
    expect(first.cursor > cursor).toBe(true);

    expect(
      pollExecutions(first.cursor).executions.map((execution) => execution.id),
    ).not.toContain(executionId);
  });

  it("streams text/event-stream and stops when the client disconnects", async () => {
    const controller = new AbortController();

    const response = await streamRoute(
      new NextRequest("http://localhost:3000/api/stream", {
        signal: controller.signal,
      }),
    );

    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body!.getReader();

    const { value } = await reader.read();

    expect(new TextDecoder().decode(value)).toContain("event: ready");

    controller.abort();

    const { done } = await reader.read();

    expect(done).toBe(true);
  });
});
