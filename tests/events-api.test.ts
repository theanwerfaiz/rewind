import { afterEach, describe, expect, it } from "vitest";

import { NextRequest } from "next/server";

import db from "@/lib/db";

import { getEventById } from "@/lib/events";

import { GET as getEvent } from "@/app/api/events/[id]/route";

import { GET as listEvents, POST } from "@/app/api/events/route";

import { GET as getExecution } from "@/app/api/executions/[id]/route";

import { GET as listExecutions } from "@/app/api/executions/route";

import { GET as compareExecutionsRoute } from "@/app/api/executions/compare/route";

import { GET as getFingerprint } from "@/app/api/fingerprints/[id]/route";

import { GET as listFingerprints } from "@/app/api/fingerprints/route";

const createdIds: string[] = [];

const createdExecutionIds: string[] = [];

afterEach(() => {
  for (const id of createdIds.splice(0)) {
    db.prepare(`DELETE FROM event_edges WHERE to_event_id = ?`).run(id);
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

    expect(data.edges).toHaveLength(1);

    expect(data.edges[0]).toMatchObject({
      executionId,
      fromEventId: rootId,
      toEventId: childId,
      type: "parent_of",
      origin: "explicit",
      confidence: 1,
    });

    expect(data.graph).toMatchObject({
      rootIds: [rootId],
      firstFailureId: childId,
      failurePath: [rootId, childId],
      nodes: [
        {
          eventId: rootId,
          depth: 0,
          childIds: [childId],
          orphan: false,
        },
        {
          eventId: childId,
          depth: 1,
          childIds: [],
          orphan: false,
        },
      ],
    });

    expect(data.execution.rootTitle).toBe("POST /checkout");

    const listResponse = await listExecutions(
      new NextRequest("http://localhost:3000/api/executions?limit=500"),
    );

    const list = await listResponse.json();

    expect(
      list.executions.map((execution: { id: string }) => execution.id),
    ).toContain(executionId);
  });

  it("takes the execution status from the root once it is recorded", async () => {
    const suffix = uniqueSuffix();

    const executionId = `exe_handled_${suffix}`;

    const rootId = `evt_handled_root_${suffix}`;

    createdExecutionIds.push(executionId);

    // A dependency call fails; the application handles it.
    await createEvent({
      type: "http.dependency",
      title: "POST https://api.stripe.test/v1/charges",
      status: "error",
      executionId,
      parentEventId: rootId,
    });

    const status = () =>
      db
        .prepare(`SELECT status, fingerprint_id FROM executions WHERE id = ?`)
        .get(executionId) as {
        status: string;
        fingerprint_id: string | null;
      };

    // Until the root arrives, the failure counts.
    expect(status().status).toBe("error");

    await createEvent({
      id: rootId,
      type: "http.request",
      title: "POST /api/handled/checkout",
      status: "success",
      executionId,
      parentEventId: null,
    });

    expect(status()).toEqual({
      status: "success",
      fingerprint_id: null,
    });

    // Later child events do not overturn the recorded outcome.
    await createEvent({
      type: "error",
      title: "Late background error",
      status: "error",
      executionId,
      parentEventId: rootId,
    });

    expect(status().status).toBe("success");
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

describe("failure fingerprints API", () => {
  async function captureCheckoutFailure(orderId: string, timeoutMs: number) {
    const suffix = uniqueSuffix();

    const executionId = `exe_fp_${suffix}`;

    const rootId = `evt_fproot_${suffix}`;

    createdExecutionIds.push(executionId);

    // Child first, as in real capture: the root is stored when it finishes.
    await createEvent({
      id: `evt_fpchild_${suffix}`,
      type: "error",
      title: `Payment timeout after ${timeoutMs}ms`,
      status: "error",
      executionId,
      parentEventId: rootId,
    });

    await createEvent({
      id: rootId,
      type: "http.request",
      title: `POST /api/fp-test/${orderId}/checkout`,
      status: "error",
      executionId,
      parentEventId: null,
    });

    const execution = db
      .prepare(`SELECT fingerprint_id FROM executions WHERE id = ?`)
      .get(executionId) as { fingerprint_id: string | null };

    return {
      executionId,
      fingerprintId: execution.fingerprint_id,
    };
  }

  it("groups recurring failures under one fingerprint", async () => {
    const first = await captureCheckoutFailure("1001", 5000);
    const second = await captureCheckoutFailure("2002", 9000);

    expect(first.fingerprintId).toMatch(/^fp_/);
    expect(second.fingerprintId).toBe(first.fingerprintId);

    const response = await getFingerprint(
      new NextRequest(
        `http://localhost:3000/api/fingerprints/${first.fingerprintId}`,
      ),
      {
        params: Promise.resolve({
          id: first.fingerprintId!,
        }),
      },
    );

    const data = await response.json();

    expect(data.fingerprint).toMatchObject({
      id: first.fingerprintId,
      count: 2,
      representativeExecutionId: first.executionId,
      signature: {
        endpoint: "POST /api/fp-test/:id/checkout",
        originType: "error",
        message: "payment timeout after <n>",
        path: "http.request>error",
      },
    });

    expect(
      data.executions.map((execution: { id: string }) => execution.id).sort(),
    ).toEqual([first.executionId, second.executionId].sort());

    const listResponse = await listFingerprints(
      new NextRequest("http://localhost:3000/api/fingerprints?limit=500"),
    );

    const list = await listResponse.json();

    expect(
      list.fingerprints.map((fingerprint: { id: string }) => fingerprint.id),
    ).toContain(first.fingerprintId);
  });

  it("does not fingerprint successful executions", async () => {
    const executionId = `exe_fp_ok_${uniqueSuffix()}`;

    createdExecutionIds.push(executionId);

    await createEvent({
      type: "http.request",
      title: "GET /api/fp-ok",
      status: "success",
      executionId,
      parentEventId: null,
    });

    const execution = db
      .prepare(`SELECT fingerprint_id FROM executions WHERE id = ?`)
      .get(executionId) as { fingerprint_id: string | null };

    expect(execution.fingerprint_id).toBeNull();
  });

  it("backfills fingerprints for failed executions on read", async () => {
    const { executionId, fingerprintId } = await captureCheckoutFailure(
      "3003",
      1000,
    );

    db.prepare(
      `UPDATE executions
       SET fingerprint_id = NULL, fingerprint_version = NULL
       WHERE id = ?`,
    ).run(executionId);

    await listFingerprints(
      new NextRequest("http://localhost:3000/api/fingerprints"),
    );

    const execution = db
      .prepare(`SELECT fingerprint_id FROM executions WHERE id = ?`)
      .get(executionId) as { fingerprint_id: string | null };

    expect(execution.fingerprint_id).toBe(fingerprintId);
  });

  it("returns 404 for an unknown fingerprint", async () => {
    const response = await getFingerprint(
      new NextRequest("http://localhost:3000/api/fingerprints/fp_nope"),
      {
        params: Promise.resolve({
          id: "fp_nope",
        }),
      },
    );

    expect(response.status).toBe(404);
  });
});

describe("execution compare API", () => {
  async function captureCheckout(failing: boolean) {
    const suffix = uniqueSuffix();

    const executionId = `exe_cmp_${suffix}`;

    const rootId = `evt_cmproot_${suffix}`;

    createdExecutionIds.push(executionId);

    await createEvent({
      id: `evt_cmppay_${suffix}`,
      timestamp: "2026-09-01T10:00:00.020Z",
      type: failing ? "error" : "database.query",
      title: failing ? "Payment timeout after 5000ms" : "DB: commit order",
      status: failing ? "error" : "success",
      executionId,
      parentEventId: rootId,
    });

    await createEvent({
      id: rootId,
      timestamp: "2026-09-01T10:00:00.000Z",
      duration: failing ? "200ms" : "40ms",
      type: "http.request",
      title: "POST /api/cmp-test/checkout",
      status: failing ? "error" : "success",
      executionId,
      parentEventId: null,
      metadata: {
        response: {
          status: failing ? 500 : 200,
        },
      },
    });

    return executionId;
  }

  function compare(original?: string, candidate?: string) {
    const params = new URLSearchParams();

    if (original) {
      params.set("original", original);
    }

    if (candidate) {
      params.set("candidate", candidate);
    }

    return compareExecutionsRoute(
      new NextRequest(`http://localhost:3000/api/executions/compare?${params}`),
    );
  }

  it("diffs a failed execution against a fixed one", async () => {
    const original = await captureCheckout(true);
    const candidate = await captureCheckout(false);

    const response = await compare(original, candidate);

    expect(response.status).toBe(200);

    const { diff } = await response.json();

    expect(diff.outcome).toBe("fixed");

    expect(diff.original).toMatchObject({
      executionId: original,
      status: "error",
      httpStatus: 500,
    });

    expect(diff.candidate).toMatchObject({
      executionId: candidate,
      status: "success",
      httpStatus: 200,
    });

    expect(diff.summary).toEqual(
      expect.arrayContaining([
        "Failure removed: Payment timeout after 5000ms",
        "Added event: DB: commit order",
      ]),
    );
  });

  it("reports the same failure as still failing", async () => {
    const first = await captureCheckout(true);
    const second = await captureCheckout(true);

    const { diff } = await (await compare(first, second)).json();

    expect(diff.outcome).toBe("still_failing");
  });

  it("requires both execution IDs", async () => {
    expect((await compare("exe_only_one")).status).toBe(400);
  });

  it("returns 404 when an execution does not exist", async () => {
    const existing = await captureCheckout(false);

    expect((await compare(existing, "exe_missing")).status).toBe(404);
  });
});
