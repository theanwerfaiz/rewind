import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NextRequest } from "next/server";

import { POST as createEvent } from "@/app/api/events/route";
import { DELETE as unlink, POST as link } from "@/app/api/incidents/[id]/executions/route";
import { GET as getIncident, PATCH } from "@/app/api/incidents/[id]/route";
import { GET as listIncidents, POST as create } from "@/app/api/incidents/route";
import db from "@/lib/db";
import { getIncidentsForExecution } from "@/lib/incidents";

// Rolled back after each test, so parallel test files never see these rows.
beforeEach(() => {
  db.exec("BEGIN");
});

afterEach(() => {
  db.exec("ROLLBACK");
});

function json(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function captureExecution() {
  const executionId = `exe_incident_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  await createEvent(
    json("/api/events", "POST", {
      type: "http.request",
      title: "POST /api/checkout",
      status: "error",
      executionId,
    }),
  );

  return executionId;
}

describe("incidents API", () => {
  it("creates an incident from an execution and lists it", async () => {
    const executionId = await captureExecution();

    const response = await create(
      json("/api/incidents", "POST", { title: "  Checkout 502s  ", executionId }),
    );

    expect(response.status).toBe(201);

    const { incident } = await response.json();

    expect(incident).toMatchObject({
      title: "Checkout 502s",
      status: "open",
      executionCount: 1,
    });

    expect(incident.id).toMatch(/^inc_/);

    const list = await (await listIncidents()).json();

    expect(list.incidents.map((item: { id: string }) => item.id)).toContain(incident.id);

    expect(getIncidentsForExecution(executionId).map((item) => item.id)).toEqual([
      incident.id,
    ]);
  });

  it("validates titles, statuses and executions", async () => {
    expect((await create(json("/api/incidents", "POST", { title: " " }))).status).toBe(400);

    expect(
      (await create(json("/api/incidents", "POST", { title: "x", executionId: "exe_missing" })))
        .status,
    ).toBe(400);

    const { incident } = await (
      await create(json("/api/incidents", "POST", { title: "Timeouts" }))
    ).json();

    expect(
      (await PATCH(json(`/api/incidents/${incident.id}`, "PATCH", { status: "closed" }), context(incident.id)))
        .status,
    ).toBe(400);

    expect(
      (await PATCH(json("/api/incidents/inc_missing", "PATCH", { status: "open" }), context("inc_missing")))
        .status,
    ).toBe(404);
  });

  it("updates notes and status, and links and unlinks executions", async () => {
    const executionId = await captureExecution();

    const { incident } = await (
      await create(json("/api/incidents", "POST", { title: "Payments" }))
    ).json();

    const linked = await link(
      json(`/api/incidents/${incident.id}/executions`, "POST", { executionId }),
      context(incident.id),
    );

    expect((await linked.json()).incident.executionCount).toBe(1);

    // Linking twice is a no-op.
    await link(
      json(`/api/incidents/${incident.id}/executions`, "POST", { executionId }),
      context(incident.id),
    );

    const patched = await PATCH(
      json(`/api/incidents/${incident.id}`, "PATCH", {
        status: "resolved",
        notes: "Fixed by retrying the charge.",
      }),
      context(incident.id),
    );

    expect((await patched.json()).incident).toMatchObject({
      status: "resolved",
      notes: "Fixed by retrying the charge.",
      executionCount: 1,
    });

    const detail = await (
      await getIncident(json(`/api/incidents/${incident.id}`, "GET"), context(incident.id))
    ).json();

    expect(detail.executions.map((execution: { id: string }) => execution.id)).toEqual([
      executionId,
    ]);

    const unlinked = await unlink(
      json(`/api/incidents/${incident.id}/executions`, "DELETE", { executionId }),
      context(incident.id),
    );

    expect((await unlinked.json()).incident.executionCount).toBe(0);
  });
});
