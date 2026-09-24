import { afterEach, describe, expect, it } from "vitest";

import { NextRequest } from "next/server";

import { POST } from "@/app/api/events/route";
import { GET as searchRoute } from "@/app/api/search/route";
import db from "@/lib/db";
import { escapeLike, search } from "@/lib/search";

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

async function createRequest(title: string, executionId: string) {
  const response = await POST(
    new NextRequest("http://localhost:3000/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "http.request",
        title,
        status: "success",
        executionId,
      }),
    }),
  );

  const data = await response.json();

  createdEventIds.push(data.event.id);
  createdExecutionIds.push(executionId);

  return data.event as { id: string };
}

function suffix() {
  return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

describe("search", () => {
  it("returns nothing for an empty query", () => {
    expect(search("   ")).toEqual([]);
  });

  it("finds an execution by root title", async () => {
    const tag = suffix();

    const executionId = `exe_search_${tag}`;

    await createRequest(`POST /api/palette-${tag}`, executionId);

    const results = search(`palette-${tag}`);

    expect(results).toContainEqual(
      expect.objectContaining({
        kind: "execution",
        id: executionId,
        href: `/executions/${executionId}`,
        title: `POST /api/palette-${tag}`,
      }),
    );
  });

  it("jumps to an execution and an event by ID prefix", async () => {
    const tag = suffix();

    const executionId = `exe_prefix_${tag}`;

    const event = await createRequest("GET /api/prefix", executionId);

    expect(search(executionId.slice(0, -2))).toContainEqual(
      expect.objectContaining({ kind: "execution", id: executionId }),
    );

    expect(search(event.id)).toContainEqual(
      expect.objectContaining({ kind: "event", href: `/events/${event.id}` }),
    );
  });

  it("treats LIKE wildcards literally", async () => {
    const tag = suffix();

    await createRequest(`GET /api/wild-${tag}`, `exe_wild_${tag}`);

    // "%" would match everything if it were not escaped.
    expect(search("%").filter((result) => result.kind === "execution")).toEqual(
      [],
    );

    expect(escapeLike("exe_1%")).toBe("exe\\_1\\%");
  });

  it("is served by GET /api/search", async () => {
    const tag = suffix();

    const executionId = `exe_route_${tag}`;

    await createRequest(`POST /api/route-${tag}`, executionId);

    const response = await searchRoute(
      new NextRequest(`http://localhost:3000/api/search?q=route-${tag}`),
    );

    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data.results[0]).toMatchObject({
      kind: "execution",
      id: executionId,
    });
  });
});
