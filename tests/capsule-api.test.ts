import { afterEach, describe, expect, it } from "vitest";

import { NextRequest } from "next/server";

import db from "@/lib/db";

import { GET as getExecution } from "@/app/api/executions/[id]/route";

import { GET as exportCapsuleRoute } from "@/app/api/executions/[id]/capsule/route";

import {
  GET as listInvariantsRoute,
  POST as addInvariantRoute,
} from "@/app/api/executions/[id]/invariants/route";

import { DELETE as deleteInvariantRoute } from "@/app/api/invariants/[id]/route";

import { POST as createEvent } from "@/app/api/events/route";

import {
  GET as listCapsules,
  POST as importCapsuleRoute,
} from "@/app/api/capsules/route";

const executionIds: string[] = [];

function removeExecution(executionId: string) {
  db.prepare(`DELETE FROM invariants WHERE execution_id = ?`).run(executionId);
  db.prepare(`DELETE FROM event_edges WHERE execution_id = ?`).run(executionId);
  db.prepare(`DELETE FROM events WHERE execution_id = ?`).run(executionId);
  db.prepare(`DELETE FROM executions WHERE id = ?`).run(executionId);
  db.prepare(`DELETE FROM capsule_imports WHERE execution_id = ?`).run(
    executionId,
  );
}

afterEach(() => {
  for (const executionId of executionIds.splice(0)) {
    removeExecution(executionId);
  }
});

function suffix() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function post(body: Record<string, unknown>) {
  const response = await createEvent(
    new NextRequest("http://localhost:3000/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );

  expect(response.status).toBe(201);
}

async function captureExecution(payload: unknown = { amount: 5000 }) {
  const id = suffix();

  const executionId = `exe_cap_${id}`;

  const rootId = `evt_caproot_${id}`;

  executionIds.push(executionId);

  await post({
    id: `evt_capdep_${id}`,
    timestamp: "2026-09-01T10:00:00.020Z",
    duration: "150ms",
    type: "http.dependency",
    title: "POST https://api.stripe.test/v1/charges",
    status: "error",
    executionId,
    parentEventId: rootId,
    metadata: {
      response: {
        status: 504,
        body: {
          error: "timeout",
        },
      },
    },
  });

  await post({
    id: rootId,
    timestamp: "2026-09-01T10:00:00.000Z",
    duration: "180ms",
    type: "http.request",
    title: "POST /api/cap-test/checkout",
    status: "error",
    executionId,
    parentEventId: null,
    payload,
    metadata: {
      environment: "test",
      method: "POST",
      path: "/api/cap-test/checkout",
      headers: {
        "content-type": "application/json",
      },
      response: {
        status: 502,
      },
    },
  });

  return executionId;
}

function exportCapsule(executionId: string, query = "") {
  return exportCapsuleRoute(
    new NextRequest(
      `http://localhost:3000/api/executions/${executionId}/capsule${query}`,
    ),
    {
      params: Promise.resolve({
        id: executionId,
      }),
    },
  );
}

function importCapsule(body: string) {
  return importCapsuleRoute(
    new NextRequest("http://localhost:3000/api/capsules", {
      method: "POST",
      body,
    }),
  );
}

async function fetchExecution(executionId: string) {
  const response = await getExecution(
    new NextRequest(`http://localhost:3000/api/executions/${executionId}`),
    {
      params: Promise.resolve({
        id: executionId,
      }),
    },
  );

  return response.json();
}

describe("capsule export and import", () => {
  it("exports a capsule as a downloadable file", async () => {
    const executionId = await captureExecution();

    const response = await exportCapsule(executionId);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="fp_[0-9a-f]{16}\.rewind\.json"$/,
    );

    const capsule = await response.json();

    expect(capsule).toMatchObject({
      format: "rewind.capsule",
      version: 1,
      execution: {
        id: executionId,
        status: "error",
      },
      expected: {
        status: "error",
        httpStatus: 502,
      },
    });

    expect(capsule.events).toHaveLength(2);
    expect(capsule.replay.fixtures).toHaveLength(1);
  });

  it("restores an execution exactly from its capsule", async () => {
    const executionId = await captureExecution();

    const before = await fetchExecution(executionId);

    const file = await (await exportCapsule(executionId)).text();

    removeExecution(executionId);

    const response = await importCapsule(file);

    expect(response.status).toBe(201);

    const result = await response.json();

    expect(result.executionId).toBe(executionId);
    expect(result.capsuleId).toMatch(/^cap_/);

    const after = await fetchExecution(executionId);

    expect(after.events).toEqual(before.events);
    expect(
      after.edges.map((edge: { toEventId: string }) => edge.toEventId),
    ).toEqual(
      before.edges.map((edge: { toEventId: string }) => edge.toEventId),
    );
    expect(after.graph).toEqual(before.graph);

    expect(after.execution).toMatchObject({
      id: executionId,
      status: "error",
      startedAt: before.execution.startedAt,
      endedAt: before.execution.endedAt,
      rootEventId: before.execution.rootEventId,
      fingerprintId: before.execution.fingerprintId,
      eventCount: 2,
    });

    const imports = await (await listCapsules()).json();

    expect(
      imports.imports.map(
        (record: { executionId: string }) => record.executionId,
      ),
    ).toContain(executionId);
  });

  it("refuses to import over an existing execution", async () => {
    const executionId = await captureExecution();

    const file = await (await exportCapsule(executionId)).text();

    const response = await importCapsule(file);

    expect(response.status).toBe(409);
    expect((await response.json()).errors[0]).toContain("already exists");
  });

  it("rejects a tampered capsule without writing anything", async () => {
    const executionId = await captureExecution();

    const capsule = await (await exportCapsule(executionId)).json();

    removeExecution(executionId);

    capsule.expected.status = "success";

    const response = await importCapsule(JSON.stringify(capsule));

    expect(response.status).toBe(400);

    expect(
      db.prepare(`SELECT 1 FROM executions WHERE id = ?`).get(executionId),
    ).toBeUndefined();

    expect(
      db
        .prepare(`SELECT 1 FROM events WHERE execution_id = ?`)
        .get(executionId),
    ).toBeUndefined();
  });

  it("rejects invalid JSON", async () => {
    const response = await importCapsule("{not json");

    expect(response.status).toBe(400);
  });

  it("blocks exporting secrets unless explicitly forced", async () => {
    const executionId = await captureExecution({
      note: "customer pasted sk_live_51HxYzAbCdEfGhIjKl into the form",
    });

    const blocked = await exportCapsule(executionId);

    expect(blocked.status).toBe(422);

    const body = await blocked.json();

    // The payload is in the root event and in the replay instructions;
    // both copies are reported.
    expect(
      body.findings.map((finding: { path: string }) => finding.path).sort(),
    ).toEqual(["events[0].payload.note", "replay.payload.note"]);

    for (const finding of body.findings) {
      expect(finding).toMatchObject({
        rule: "Stripe secret key",
        severity: "secret",
      });
    }

    expect(JSON.stringify(body)).not.toContain("sk_live_51HxYzAbCdEfGhIjKl");

    const forced = await exportCapsule(executionId, "?force=1");

    expect(forced.status).toBe(200);
  });

  it("returns 404 for an unknown execution", async () => {
    expect((await exportCapsule("exe_missing")).status).toBe(404);
  });
});

describe("invariants API", () => {
  function params(id: string) {
    return {
      params: Promise.resolve({
        id,
      }),
    };
  }

  function add(executionId: string, body: unknown) {
    return addInvariantRoute(
      new NextRequest(
        `http://localhost:3000/api/executions/${executionId}/invariants`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      ),
      params(executionId),
    );
  }

  async function list(executionId: string) {
    return (
      await listInvariantsRoute(
        new NextRequest(
          `http://localhost:3000/api/executions/${executionId}/invariants`,
        ),
        params(executionId),
      )
    ).json();
  }

  it("adds, evaluates and deletes invariants", async () => {
    const executionId = await captureExecution();

    const created = await add(executionId, {
      kind: "http_status",
      equals: 200,
    });

    expect(created.status).toBe(201);

    const { invariant, description } = await created.json();

    expect(invariant.id).toMatch(/^inv_/);
    expect(description).toBe("HTTP status is 200");

    expect((await list(executionId)).invariants).toEqual([
      {
        invariant,
        description,
        result: {
          invariantId: invariant.id,
          passed: false,
          actual: "502",
        },
      },
    ]);

    const deleted = await deleteInvariantRoute(
      new NextRequest(`http://localhost:3000/api/invariants/${invariant.id}`, {
        method: "DELETE",
      }),
      params(invariant.id),
    );

    expect(deleted.status).toBe(204);
    expect((await list(executionId)).invariants).toEqual([]);
  });

  it("rejects invalid invariants and unknown executions", async () => {
    const executionId = await captureExecution();

    expect((await add(executionId, { kind: "maybe" })).status).toBe(400);
    expect(
      (await add("exe_missing", { kind: "no_unhandled_errors" })).status,
    ).toBe(404);

    const missing = await deleteInvariantRoute(
      new NextRequest("http://localhost:3000/api/invariants/inv_missing", {
        method: "DELETE",
      }),
      params("inv_missing"),
    );

    expect(missing.status).toBe(404);
  });

  it("carries invariants through a capsule", async () => {
    const executionId = await captureExecution();

    const { invariant } = await (
      await add(executionId, {
        kind: "max_event_count",
        title: "POST https://api.stripe.test/v1/charges",
        max: 1,
      })
    ).json();

    const file = await (await exportCapsule(executionId)).text();

    expect(JSON.parse(file).invariants).toEqual([invariant]);

    removeExecution(executionId);

    expect((await importCapsule(file)).status).toBe(201);

    expect(
      (await list(executionId)).invariants.map(
        (entry: { invariant: unknown }) => entry.invariant,
      ),
    ).toEqual([invariant]);
  });
});
