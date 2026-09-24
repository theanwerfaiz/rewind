import { afterEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import db from "@/lib/db";
import { judgeOutcome, runVerification } from "@/lib/verification";

import { GET as exportCapsuleRoute } from "@/app/api/executions/[id]/capsule/route";

import { POST as createEventRoute } from "@/app/api/events/route";

import { POST as addInvariantRoute } from "@/app/api/executions/[id]/invariants/route";

import { GET as getRunRoute } from "@/app/api/verifications/[id]/route";

import {
  GET as listRunsRoute,
  POST as verifyRoute,
} from "@/app/api/verifications/route";

const executionIds = new Set<string>();

function removeExecution(executionId: string) {
  db.prepare(`DELETE FROM event_edges WHERE execution_id = ?`).run(executionId);
  db.prepare(`DELETE FROM events WHERE execution_id = ?`).run(executionId);
  db.prepare(`DELETE FROM executions WHERE id = ?`).run(executionId);
  db.prepare(`DELETE FROM capsule_imports WHERE execution_id = ?`).run(
    executionId,
  );
}

afterEach(() => {
  vi.restoreAllMocks();

  for (const executionId of executionIds) {
    removeExecution(executionId);
  }

  executionIds.clear();
});

function suffix() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function createEvent(body: Record<string, unknown>) {
  const response = await createEventRoute(
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

/** Captures a checkout execution, as the instrumented app would. */
async function captureCheckout(
  executionId: string,
  failing: boolean,
  path = "/api/verify-test/checkout",
) {
  executionIds.add(executionId);

  const rootId = `evt_vroot_${suffix()}`;

  if (failing) {
    await createEvent({
      id: `evt_vchild_${suffix()}`,
      type: "error",
      title: "Payment timeout after 5000ms",
      status: "error",
      executionId,
      parentEventId: rootId,
    });
  }

  await createEvent({
    id: rootId,
    type: "http.request",
    title: `POST ${path}`,
    status: failing ? "error" : "success",
    executionId,
    parentEventId: null,
    payload: {
      amount: 5000,
    },
    metadata: {
      method: "POST",
      path,
      headers: {
        "content-type": "application/json",
      },
      response: {
        status: failing ? 500 : 200,
      },
    },
  });
}

/**
 * Stands in for the candidate build: each replayed request is captured as
 * the execution Rewind pre-assigned, succeeding or failing as told.
 */
function mockCandidate(behaviour: "fixed" | "failing" | "uninstrumented") {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_input, init) => {
      const executionId = new Headers(init?.headers).get(
        "x-rewind-execution-id",
      );

      if (behaviour !== "uninstrumented" && executionId) {
        await captureCheckout(executionId, behaviour === "failing");
      }

      return new Response(behaviour === "fixed" ? "ok" : "fail", {
        status: behaviour === "fixed" ? 200 : 500,
      });
    });
}

describe("judgeOutcome", () => {
  it.each([
    ["error", "fixed", "pass"],
    ["error", "still_failing", "fail"],
    ["error", "different_failure", "fail"],
    ["success", "unchanged", "pass"],
    ["success", "behavior_changed", "pass"],
    ["success", "regressed", "fail"],
  ] as const)("%s + %s → %s", (expected, outcome, verdict) => {
    expect(judgeOutcome(expected, outcome).verdict).toBe(verdict);
  });
});

describe("runVerification", () => {
  it("passes a historical failure that the candidate fixed", async () => {
    const original = `exe_verify_${suffix()}`;

    await captureCheckout(original, true);

    mockCandidate("fixed");

    const run = await runVerification({
      targets: [{ executionId: original }],
      codeVersion: "abc123",
    });

    for (const result of run.results) {
      if (result.resultExecutionId) {
        executionIds.add(result.resultExecutionId);
      }
    }

    expect(run).toMatchObject({
      codeVersion: "abc123",
      total: 1,
      passed: 1,
      failed: 0,
    });

    expect(run.results[0]).toMatchObject({
      executionId: original,
      title: "POST /api/verify-test/checkout",
      expectedStatus: "error",
      outcome: "fixed",
      verdict: "pass",
    });

    expect(run.results[0].replayId).toMatch(/^replay_/);
  });

  it("fails a historical failure that still reproduces", async () => {
    const original = `exe_verify_${suffix()}`;

    await captureCheckout(original, true);

    mockCandidate("failing");

    const run = await runVerification({
      targets: [{ executionId: original }],
    });

    for (const result of run.results) {
      if (result.resultExecutionId) {
        executionIds.add(result.resultExecutionId);
      }
    }

    expect(run.results[0]).toMatchObject({
      outcome: "still_failing",
      verdict: "fail",
      reason: "The original failure still reproduces.",
    });

    expect(run.failed).toBe(1);
  });

  it("fails a success that the candidate breaks", async () => {
    const original = `exe_verify_${suffix()}`;

    await captureCheckout(original, false);

    mockCandidate("failing");

    const run = await runVerification({
      targets: [{ executionId: original }],
    });

    for (const result of run.results) {
      if (result.resultExecutionId) {
        executionIds.add(result.resultExecutionId);
      }
    }

    expect(run.results[0]).toMatchObject({
      outcome: "regressed",
      verdict: "fail",
    });
  });

  async function addInvariant(executionId: string, definition: unknown) {
    const response = await addInvariantRoute(
      new NextRequest(
        `http://localhost:3000/api/executions/${executionId}/invariants`,
        {
          method: "POST",
          body: JSON.stringify(definition),
        },
      ),
      {
        params: Promise.resolve({
          id: executionId,
        }),
      },
    );

    expect(response.status).toBe(201);
  }

  it("fails a fix that breaks an invariant", async () => {
    const original = `exe_verify_${suffix()}`;

    await captureCheckout(original, true);

    // The fixed checkout must create the order (201), not just return 200.
    await addInvariant(original, {
      kind: "http_status",
      equals: 201,
    });

    await addInvariant(original, {
      kind: "no_unhandled_errors",
    });

    mockCandidate("fixed");

    const run = await runVerification({
      targets: [{ executionId: original }],
    });

    for (const result of run.results) {
      if (result.resultExecutionId) {
        executionIds.add(result.resultExecutionId);
      }
    }

    expect(run.results[0]).toMatchObject({
      outcome: "fixed",
      verdict: "fail",
      reason: "Invariant failed: HTTP status is 201 (got 200)",
    });

    db.prepare(`DELETE FROM invariants WHERE execution_id = ?`).run(original);
  });

  it("passes a fix that satisfies its invariants", async () => {
    const original = `exe_verify_${suffix()}`;

    await captureCheckout(original, true);

    await addInvariant(original, {
      kind: "http_status",
      equals: 200,
    });

    await addInvariant(original, {
      kind: "event_absent",
      title: "Payment timeout after 5000ms",
    });

    mockCandidate("fixed");

    const run = await runVerification({
      targets: [{ executionId: original }],
    });

    for (const result of run.results) {
      if (result.resultExecutionId) {
        executionIds.add(result.resultExecutionId);
      }
    }

    expect(run.results[0]).toMatchObject({
      outcome: "fixed",
      verdict: "pass",
    });

    db.prepare(`DELETE FROM invariants WHERE execution_id = ?`).run(original);
  });

  it("explains a target that does not capture replays", async () => {
    const original = `exe_verify_${suffix()}`;

    await captureCheckout(original, true);

    mockCandidate("uninstrumented");

    const run = await runVerification({
      targets: [{ executionId: original }],
    });

    expect(run.results[0]).toMatchObject({
      verdict: "fail",
      outcome: null,
    });

    expect(run.results[0].reason).toContain("withRewindCapture");
  });

  it("fails unknown executions without stopping the run", async () => {
    const original = `exe_verify_${suffix()}`;

    await captureCheckout(original, true);

    const fetchMock = mockCandidate("fixed");

    const run = await runVerification({
      targets: [{ executionId: "exe_missing" }, { executionId: original }],
    });

    for (const result of run.results) {
      if (result.resultExecutionId) {
        executionIds.add(result.resultExecutionId);
      }
    }

    expect(run.results.map((result) => result.verdict)).toEqual([
      "fail",
      "pass",
    ]);

    expect(run.results[0].reason).toBe("Execution not found.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("verification API", () => {
  async function post(body: unknown) {
    const response = await verifyRoute(
      new NextRequest("http://localhost:3000/api/verifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );

    return {
      status: response.status,
      data: await response.json(),
    };
  }

  it("imports and verifies capsules, and stores the run", async () => {
    const original = `exe_verify_${suffix()}`;

    await captureCheckout(original, true);

    const capsule = await (
      await exportCapsuleRoute(
        new NextRequest(
          `http://localhost:3000/api/executions/${original}/capsule`,
        ),
        {
          params: Promise.resolve({
            id: original,
          }),
        },
      )
    ).json();

    // Verify on a Rewind that does not have the execution yet.
    removeExecution(original);
    executionIds.add(original);

    mockCandidate("fixed");

    const { status, data } = await post({
      capsules: [capsule],
      codeVersion: "pr-42",
    });

    for (const result of data.run.results) {
      if (result.resultExecutionId) {
        executionIds.add(result.resultExecutionId);
      }
    }

    expect(status).toBe(201);

    expect(data.run.results[0]).toMatchObject({
      executionId: original,
      capsuleId: capsule.id,
      outcome: "fixed",
      verdict: "pass",
    });

    const stored = await (
      await getRunRoute(
        new NextRequest(
          `http://localhost:3000/api/verifications/${data.run.id}`,
        ),
        {
          params: Promise.resolve({
            id: data.run.id,
          }),
        },
      )
    ).json();

    expect(stored.run).toEqual(data.run);

    const list = await (await listRunsRoute()).json();

    expect(list.runs.map((run: { id: string }) => run.id)).toContain(
      data.run.id,
    );
  });

  it.each([
    ["nothing to verify", {}, "Nothing to verify"],
    ["an invalid capsule", { capsules: [{}] }, "capsules[0]"],
    ["bad execution ids", { executionIds: [1] }, "executionIds must be"],
    ["an unknown selection", { select: "everything" }, "select must be"],
  ])("rejects %s", async (_label, body, message) => {
    const { status, data } = await post(body);

    expect(status).toBe(400);
    expect(data.errors.join(" ")).toContain(message);
  });
});
