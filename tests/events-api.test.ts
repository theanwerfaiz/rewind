import { afterEach, describe, expect, it } from "vitest";

import { NextRequest } from "next/server";

import db from "@/lib/db";

import { getEventById } from "@/lib/events";

import { GET as getEvent } from "@/app/api/events/[id]/route";

import { GET as listEvents, POST } from "@/app/api/events/route";

import { GET as getExecution } from "@/app/api/executions/[id]/route";

import { GET as listExecutions } from "@/app/api/executions/route";

const createdIds: string[] = [];

const createdExecutionIds: string[] = [];

afterEach(() => {
  for (const id of createdIds.splice(0)) {
    db.prepare(`DELETE FROM events WHERE id = ?`).run(id);
  }

  for (const id of createdExecutionIds.splice(0)) {
    db.prepare(`DELETE FROM executions WHERE id = ?`).run(id);
  }
});

function uniqueSuffix() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function createEvent(body: Record<string, unknown>) {
  const response = await POST(
    new NextRequest("http://localhost:3000/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );

  const data = await response.json();

  if (data.event?.id) {
    createdIds.push(data.event.id);
  }

  return {
    response,
    data,
  };
}

describe("events API correlation IDs", () => {
  it("persists and returns all five correlation IDs", async () => {
    const suffix = uniqueSuffix();

    const ids = {
      traceId: `trace_${suffix}`,
      spanId: `span_${suffix}`,
      requestId: `req_${suffix}`,
      sessionId: `sess_${suffix}`,
      userId: `user_${suffix}`,
    };

    const { response, data } = await createEvent({
      type: "http.request",
      title: "POST /api/correlation",
      status: "success",
      ...ids,
    });

    expect(response.status).toBe(201);

    expect(data.event).toMatchObject(ids);

    const eventId = data.event.id as string;

    const detailResponse = await getEvent(
      new NextRequest(`http://localhost:3000/api/events/${eventId}`),
      {
        params: Promise.resolve({
          id: eventId,
        }),
      },
    );

    expect(await detailResponse.json()).toMatchObject(ids);

    expect(getEventById(eventId)).toMatchObject(ids);
  });

  it("finds events by trace, span, and session ID", async () => {
    const suffix = uniqueSuffix();

    const { data } = await createEvent({
      type: "http.request",
      title: "GET /api/searchable",
      traceId: `trace_search_${suffix}`,
      spanId: `span_search_${suffix}`,
      sessionId: `sess_search_${suffix}`,
    });

    for (const term of [
      `trace_search_${suffix}`,
      `span_search_${suffix}`,
      `sess_search_${suffix}`,
    ]) {
      const listResponse = await listEvents(
        new NextRequest(
          `http://localhost:3000/api/events?search=${encodeURIComponent(term)}`,
        ),
      );

      const list = await listResponse.json();

      expect(list.events.map((event: { id: string }) => event.id)).toContain(
        data.event.id,
      );
    }
  });

  it("stores null for missing, blank, or non-string correlation IDs", async () => {
    const { response, data } = await createEvent({
      type: "http.request",
      title: "POST /api/invalid-ids",
      traceId: "   ",
      spanId: {
        nested: true,
      },
      requestId: 42,
    });

    expect(response.status).toBe(201);

    expect(data.event).toMatchObject({
      traceId: null,
      spanId: null,
      requestId: "42",
      sessionId: null,
      userId: null,
    });
  });
});

describe("events API execution identity", () => {
  async function fetchExecution(executionId: string) {
    const response = await getExecution(
      new NextRequest(`http://localhost:3000/api/executions/${executionId}`),
      {
        params: Promise.resolve({
          id: executionId,
        }),
      },
    );

    return {
      response,
      data: await response.json(),
    };
  }

  it("honours a client-assigned event id and timestamp", async () => {
    const id = `evt_client_${uniqueSuffix()}`;

    const { response, data } = await createEvent({
      id,
      timestamp: "2026-09-01T10:00:00.000Z",
      type: "command",
      title: "npm test",
    });

    expect(response.status).toBe(201);
    expect(data.event.id).toBe(id);
    expect(data.event.timestamp).toBe("2026-09-01T10:00:00.000Z");
  });

  it("rejects a duplicate event id with 409", async () => {
    const id = `evt_dup_${uniqueSuffix()}`;

    await createEvent({
      id,
      type: "command",
      title: "first",
    });

    const { response } = await createEvent({
      id,
      type: "command",
      title: "second",
    });

    expect(response.status).toBe(409);

    expect(getEventById(id)?.title).toBe("first");
  });

  it("rejects a malformed event id with 400", async () => {
    const { response } = await createEvent({
      id: "not an id; DROP TABLE events",
      type: "command",
      title: "bad id",
    });

    expect(response.status).toBe(400);
  });

  it("creates an execution and folds child events into it", async () => {
    const suffix = uniqueSuffix();

    const executionId = `exe_${suffix}`;

    const rootId = `evt_root_${suffix}`;

    const childId = `evt_child_${suffix}`;

    createdExecutionIds.push(executionId);

    // The child is stored before its root, as it is during real capture.
    await createEvent({
      id: childId,
      timestamp: "2026-09-01T10:00:00.050Z",
      duration: "20ms",
      type: "error",
      title: "Payment timeout",
      status: "error",
      executionId,
      parentEventId: rootId,
    });

    await createEvent({
      id: rootId,
      timestamp: "2026-09-01T10:00:00.000Z",
      duration: "100ms",
      type: "http.request",
      title: "POST /checkout",
      status: "error",
      traceId: `trace_${suffix}`,
      executionId,
      parentEventId: null,
      metadata: {
        environment: "test",
      },
    });

    const { response, data } = await fetchExecution(executionId);

    expect(response.status).toBe(200);

    expect(data.execution).toMatchObject({
      id: executionId,
      rootEventId: rootId,
      status: "error",
      traceId: `trace_${suffix}`,
      environment: "test",
      eventCount: 2,
      startedAt: "2026-09-01T10:00:00.000Z",
      endedAt: "2026-09-01T10:00:00.100Z",
    });

    expect(data.events.map((event: { id: string }) => event.id)).toEqual([
      rootId,
      childId,
    ]);

    expect(data.events[1]).toMatchObject({
      executionId,
      parentEventId: rootId,
    });

    const listResponse = await listExecutions(
      new NextRequest("http://localhost:3000/api/executions?limit=500"),
    );

    const list = await listResponse.json();

    expect(
      list.executions.map((execution: { id: string }) => execution.id),
    ).toContain(executionId);
  });

  it("keeps a successful execution successful", async () => {
    const executionId = `exe_ok_${uniqueSuffix()}`;

    createdExecutionIds.push(executionId);

    await createEvent({
      type: "http.request",
      title: "GET /health",
      status: "success",
      executionId,
      parentEventId: null,
    });

    const { data } = await fetchExecution(executionId);

    expect(data.execution.status).toBe("success");
  });

  it("returns 404 for an unknown execution", async () => {
    const { response } = await fetchExecution("exe_does_not_exist");

    expect(response.status).toBe(404);
  });

  it("does not create an execution for standalone events", async () => {
    const { data } = await createEvent({
      type: "deployment",
      title: "Deploy",
    });

    expect(data.event.executionId).toBeNull();
    expect(data.event.parentEventId).toBeNull();
  });
});
