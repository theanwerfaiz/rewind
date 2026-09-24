import { afterEach, describe, expect, it } from "vitest";

import { NextRequest } from "next/server";

import db from "@/lib/db";

import { getEventById } from "@/lib/events";

import { GET as getEvent } from "@/app/api/events/[id]/route";

import { GET as listEvents, POST } from "@/app/api/events/route";

const createdIds: string[] = [];

afterEach(() => {
  for (const id of createdIds.splice(0)) {
    db.prepare(`DELETE FROM events WHERE id = ?`).run(id);
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
