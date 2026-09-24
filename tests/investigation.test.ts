import { afterEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import db from "@/lib/db";
import {
  buildInvestigation,
  concludeInvestigation,
  testHypotheses,
} from "@/lib/investigation";

import { POST as createEventRoute } from "@/app/api/events/route";

import {
  GET as getInvestigationRoute,
  POST as runInvestigationRoute,
} from "@/app/api/executions/[id]/investigation/route";

const executionIds = new Set<string>();

afterEach(() => {
  vi.restoreAllMocks();

  for (const executionId of executionIds) {
    db.prepare(`DELETE FROM event_edges WHERE execution_id = ?`).run(
      executionId,
    );
    db.prepare(`DELETE FROM events WHERE execution_id = ?`).run(executionId);
    db.prepare(`DELETE FROM executions WHERE id = ?`).run(executionId);
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

const PATH = "/api/investigate-test/orders/1/checkout";

const STRIPE = "POST https://api.stripe.investigate.test/v1/charges";

/**
 * Captures a checkout. Failing ones get a 504 from Stripe; successful ones
 * a 201. The payload amount is what the "input" hypothesis compares.
 */
async function captureCheckout(
  executionId: string,
  options: {
    failing: boolean;
    amount: number;
    startedAt: string;
    withDependency?: boolean;
  },
) {
  executionIds.add(executionId);

  const rootId = `evt_inv_root_${suffix()}`;

  if (options.withDependency ?? true) {
    await createEvent({
      id: `evt_inv_dep_${suffix()}`,
      timestamp: new Date(Date.parse(options.startedAt) + 30).toISOString(),
      duration: "20ms",
      type: "http.dependency",
      title: STRIPE,
      status: options.failing ? "error" : "success",
      executionId,
      parentEventId: rootId,
      metadata: {
        response: options.failing
          ? { status: 504, body: { error: "timeout" } }
          : { status: 201, body: { id: "ch_ok", paid: true } },
      },
    });
  }

  await createEvent({
    id: rootId,
    timestamp: options.startedAt,
    duration: "100ms",
    type: "http.request",
    title: `POST ${PATH}`,
    status: options.failing ? "error" : "success",
    executionId,
    parentEventId: null,
    payload: {
      orderId: "ord_1",
      amount: options.amount,
    },
    metadata: {
      method: "POST",
      path: PATH,
      headers: {
        "content-type": "application/json",
      },
      response: {
        status: options.failing ? 502 : 200,
      },
    },
  });
}

/** The candidate app: captures each replay as succeeding or failing. */
function mockCandidate(succeeds: (body: unknown) => boolean) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_input, init) => {
      const executionId = new Headers(init?.headers).get(
        "x-rewind-execution-id",
      );

      const body = init?.body ? JSON.parse(String(init.body)) : undefined;

      if (executionId) {
        await captureCheckout(executionId, {
          failing: !succeeds(body),
          amount: 0,
          startedAt: new Date().toISOString(),
          withDependency: false,
        });
      }

      return new Response("done");
    });
}

describe("buildInvestigation", () => {
  it("returns nothing for a successful execution", async () => {
    const executionId = `exe_inv_${suffix()}`;

    await captureCheckout(executionId, {
      failing: false,
      amount: 10,
      startedAt: "2026-09-01T09:00:00.000Z",
    });

    expect(buildInvestigation(executionId)).toBeNull();
  });

  it("cites evidence and proposes testable hypotheses", async () => {
    const good = `exe_inv_good_${suffix()}`;
    const bad = `exe_inv_bad_${suffix()}`;

    await captureCheckout(good, {
      failing: false,
      amount: 500,
      startedAt: "2026-09-01T09:00:00.000Z",
    });

    await captureCheckout(bad, {
      failing: true,
      amount: 5000,
      startedAt: "2026-09-01T10:00:00.000Z",
    });

    const investigation = buildInvestigation(bad);

    expect(investigation?.observation).toEqual({
      statement: `POST ${PATH} returned 502.`,
      refs: [
        { kind: "execution", id: bad },
        expect.objectContaining({ kind: "event" }),
      ],
    });

    const statements = investigation?.evidence.map(
      (finding) => finding.statement,
    );

    expect(statements).toEqual(
      expect.arrayContaining([
        `The failure originates at "${STRIPE}" (+30ms), which returned 504.`,
        "The same endpoint last succeeded at 2026-09-01T09:00:00.000Z.",
      ]),
    );

    for (const finding of investigation?.evidence ?? []) {
      expect(finding.refs.length).toBeGreaterThan(0);
    }

    expect(investigation?.hypotheses).toEqual([
      expect.objectContaining({
        statement: `The failure is caused by ${STRIPE} failing with 504.`,
        experiment: expect.objectContaining({
          mutations: [
            {
              target: "dependency",
              op: "set",
              match: STRIPE,
              override: {
                status: 201,
                body: {
                  id: "ch_ok",
                  paid: true,
                },
              },
            },
          ],
        }),
      }),
      expect.objectContaining({
        id: "input:last-known-good",
        experiment: expect.objectContaining({
          mutations: [
            {
              target: "payload",
              op: "set",
              path: "amount",
              value: 500,
            },
          ],
          description: "Replay with payload.amount = 500.",
        }),
      }),
    ]);
  });
});

describe("testHypotheses", () => {
  it("confirms the hypothesis whose experiment fixes the failure", async () => {
    const good = `exe_inv_good_${suffix()}`;
    const bad = `exe_inv_bad_${suffix()}`;

    await captureCheckout(good, {
      failing: false,
      amount: 500,
      startedAt: "2026-09-01T09:00:00.000Z",
    });

    await captureCheckout(bad, {
      failing: true,
      amount: 5000,
      startedAt: "2026-09-01T10:00:00.000Z",
    });

    // The candidate only succeeds for small amounts: the input matters,
    // the dependency alone does not.
    mockCandidate(
      (body) => (body as { amount: number } | undefined)!.amount <= 1000,
    );

    const investigation = buildInvestigation(bad)!;

    const results = await testHypotheses(investigation);

    for (const result of results) {
      for (const ref of result.refs) {
        if (ref.kind === "execution") {
          executionIds.add(ref.id);
        }
      }
    }

    expect(
      results.map((result) => [
        result.hypothesisId.split(":")[0],
        result.status,
      ]),
    ).toEqual([
      ["dependency", "rejected"],
      ["input", "confirmed"],
    ]);

    expect(results[1].statement).toBe(
      "Confirmed: Replay with payload.amount = 500 turns the failure into a success.",
    );

    expect(results[1].refs).toEqual([
      expect.objectContaining({ kind: "replay" }),
      expect.objectContaining({ kind: "execution" }),
    ]);

    expect(concludeInvestigation(results)).toBe(results[1].statement);
  });
});

describe("concludeInvestigation", () => {
  it("explains when nothing could be tested", () => {
    expect(concludeInvestigation([])).toContain("No testable hypothesis");
  });

  it("explains when every hypothesis was rejected", () => {
    expect(
      concludeInvestigation([
        {
          hypothesisId: "h",
          status: "rejected",
          outcome: "still_failing",
          statement: "Rejected",
          refs: [],
        },
      ]),
    ).toContain("has not captured yet");
  });
});

describe("investigation API", () => {
  function params(id: string) {
    return {
      params: Promise.resolve({
        id,
      }),
    };
  }

  it("is read-only on GET and runs experiments on POST", async () => {
    const bad = `exe_inv_bad_${suffix()}`;

    await captureCheckout(bad, {
      failing: true,
      amount: 5000,
      startedAt: "2026-09-01T10:00:00.000Z",
    });

    const fetchMock = mockCandidate(() => true);

    const read = await getInvestigationRoute(
      new NextRequest(
        `http://localhost:3000/api/executions/${bad}/investigation`,
      ),
      params(bad),
    );

    expect(read.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();

    const run = await runInvestigationRoute(
      new NextRequest(
        `http://localhost:3000/api/executions/${bad}/investigation`,
        {
          method: "POST",
        },
      ),
      params(bad),
    );

    const data = await run.json();

    for (const result of data.results) {
      for (const ref of result.refs) {
        if (ref.kind === "execution") {
          executionIds.add(ref.id);
        }
      }
    }

    expect(data.results[0].status).toBe("confirmed");
    expect(data.conclusion).toContain("Confirmed");
  });

  it("returns 404 for executions that did not fail", async () => {
    const response = await getInvestigationRoute(
      new NextRequest(
        "http://localhost:3000/api/executions/exe_missing/investigation",
      ),
      params("exe_missing"),
    );

    expect(response.status).toBe(404);
  });
});
