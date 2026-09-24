import { afterEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import {
  buildFixtures,
  DependencyBlockedError,
  DependencyReplayer,
  type DependencyFixture,
  type ReplayPlan,
} from "@/lib/dependency-replay";
import { runInExecution } from "@/lib/execution-context";
import { parseMutations } from "@/lib/mutations";
import { rewind } from "@/lib/rewind";
import { rewindFetch } from "@/lib/rewind-fetch";
import { withRewindCapture } from "@/lib/rewind-http";

afterEach(() => {
  vi.restoreAllMocks();
});

const CHARGES = "POST https://api.stripe.test/v1/charges";

function fixture(
  overrides: Partial<DependencyFixture> = {},
): DependencyFixture {
  return {
    key: CHARGES,
    title: CHARGES,
    status: 201,
    statusText: "Created",
    headers: {
      "content-type": "application/json",
    },
    body: {
      id: "ch_1",
    },
    truncated: false,
    ...overrides,
  };
}

function plan(overrides: Partial<ReplayPlan> = {}): ReplayPlan {
  return {
    replayId: "replay_test",
    mode: "recorded",
    fixtures: [fixture()],
    dependencyMutations: [],
    ...overrides,
  };
}

async function respondBody(replayer: DependencyReplayer, title = CHARGES) {
  const decision = replayer.decide(title);

  if (decision.kind !== "respond") {
    throw new Error(`expected a response, got ${decision.kind}`);
  }

  return {
    decision,
    status: decision.response.status,
    body: await decision.response.text(),
  };
}

describe("buildFixtures", () => {
  it("keeps dependency responses in call order", () => {
    const fixtures = buildFixtures([
      {
        type: "http.dependency",
        title: "GET https://api.test/users/2",
        timestamp: "2026-09-01T10:00:00.200Z",
        metadata: {
          response: {
            status: 200,
            statusText: "OK",
            headers: {
              "content-type": "application/json",
            },
            body: {
              id: 2,
            },
          },
        },
      },
      {
        type: "database.query",
        title: "SELECT 1",
        timestamp: "2026-09-01T10:00:00.050Z",
      },
      {
        type: "http.dependency",
        title: "GET https://api.test/users/1",
        timestamp: "2026-09-01T10:00:00.100Z",
        metadata: {
          response: {
            status: 404,
            truncated: true,
          },
        },
      },
      {
        type: "http.dependency",
        title: "GET https://api.test/down",
        timestamp: "2026-09-01T10:00:00.300Z",
        metadata: {
          error: "fetch failed",
        },
      },
    ]);

    expect(fixtures).toEqual([
      {
        key: "GET https://api.test/users/:id",
        title: "GET https://api.test/users/1",
        status: 404,
        statusText: "",
        headers: {},
        body: undefined,
        truncated: true,
      },
      {
        key: "GET https://api.test/users/:id",
        title: "GET https://api.test/users/2",
        status: 200,
        statusText: "OK",
        headers: {
          "content-type": "application/json",
        },
        body: {
          id: 2,
        },
        truncated: false,
      },
    ]);
  });
});

describe("DependencyReplayer", () => {
  it("answers calls from the recording, in order", async () => {
    const replayer = new DependencyReplayer(
      plan({
        fixtures: [
          fixture({ body: { id: "ch_1" } }),
          fixture({ body: { id: "ch_2" } }),
        ],
      }),
    );

    const first = await respondBody(replayer);
    const second = await respondBody(replayer);

    expect(first.decision.mode).toBe("recorded");
    expect(first.status).toBe(201);
    expect(JSON.parse(first.body)).toEqual({ id: "ch_1" });
    expect(JSON.parse(second.body)).toEqual({ id: "ch_2" });
    expect(first.decision.response.headers.get("content-type")).toBe(
      "application/json",
    );
  });

  it("matches calls whose IDs differ from the recording", async () => {
    const replayer = new DependencyReplayer(
      plan({
        fixtures: [
          fixture({
            key: "GET https://api.test/users/:id",
            title: "GET https://api.test/users/1",
          }),
        ],
      }),
    );

    expect(replayer.decide("GET https://api.test/users/42").kind).toBe(
      "respond",
    );
  });

  it("blocks calls with no recording instead of sending them live", () => {
    const replayer = new DependencyReplayer(plan());

    replayer.decide(CHARGES);

    const decision = replayer.decide(CHARGES);

    expect(decision.kind).toBe("fail");
    expect(decision.kind === "fail" && decision.error).toBeInstanceOf(
      DependencyBlockedError,
    );
    expect(decision.kind === "fail" && decision.error.message).toContain(
      "no recorded response",
    );
  });

  it("does not replay truncated recordings", () => {
    const replayer = new DependencyReplayer(
      plan({
        fixtures: [fixture({ truncated: true })],
      }),
    );

    const decision = replayer.decide(CHARGES);

    expect(decision.kind === "fail" && decision.error.message).toContain(
      "truncated",
    );
  });

  it("blocks everything in blocked mode", () => {
    const replayer = new DependencyReplayer(plan({ mode: "blocked" }));

    expect(replayer.decide(CHARGES)).toMatchObject({
      kind: "fail",
      mode: "blocked",
    });
  });

  it("sends calls live only in live mode", () => {
    const replayer = new DependencyReplayer(plan({ mode: "live" }));

    expect(replayer.decide(CHARGES)).toEqual({
      kind: "live",
    });
  });

  it("overrides the status and keeps the recorded body", async () => {
    const replayer = new DependencyReplayer(
      plan({
        dependencyMutations: [
          {
            target: "dependency",
            op: "set",
            match: CHARGES,
            override: {
              status: 500,
            },
          },
        ],
      }),
    );

    const { decision, status, body } = await respondBody(replayer);

    expect(decision.mode).toBe("mutated");
    expect(status).toBe(500);
    expect(JSON.parse(body)).toEqual({ id: "ch_1" });
  });

  it("overrides the body and caps delays", async () => {
    const replayer = new DependencyReplayer(
      plan({
        mode: "live",
        dependencyMutations: [
          {
            target: "dependency",
            op: "set",
            match: CHARGES,
            override: {
              body: {
                error: "card_declined",
              },
              delayMs: 999_999,
            },
          },
        ],
      }),
    );

    const { decision, body } = await respondBody(replayer);

    expect(decision.delayMs).toBe(30_000);
    expect(JSON.parse(body)).toEqual({ error: "card_declined" });
  });

  it("makes a dependency unavailable", () => {
    const replayer = new DependencyReplayer(
      plan({
        mode: "live",
        dependencyMutations: [
          {
            target: "dependency",
            op: "remove",
            match: CHARGES,
          },
        ],
      }),
    );

    expect(replayer.decide(CHARGES)).toMatchObject({
      kind: "fail",
      mode: "mutated",
    });
  });

  it("builds bodyless responses for 204", () => {
    const replayer = new DependencyReplayer(
      plan({
        fixtures: [fixture({ status: 204, body: undefined })],
      }),
    );

    const decision = replayer.decide(CHARGES);

    expect(decision.kind === "respond" && decision.response.status).toBe(204);
  });
});

describe("dependency mutations", () => {
  it.each([
    [
      "a set without override",
      { target: "dependency", op: "set", match: CHARGES },
      "override must be an object",
    ],
    [
      "an empty override",
      { target: "dependency", op: "set", match: CHARGES, override: {} },
      "must set status, body, or delayMs",
    ],
    [
      "an invalid status",
      {
        target: "dependency",
        op: "set",
        match: CHARGES,
        override: { status: 42 },
      },
      "status must be",
    ],
    [
      "a negative delay",
      {
        target: "dependency",
        op: "set",
        match: CHARGES,
        override: { delayMs: -1 },
      },
      "delayMs must be",
    ],
    [
      "a missing match",
      { target: "dependency", op: "remove" },
      "match must name a dependency",
    ],
  ])("rejects %s", (_label, input, message) => {
    const result = parseMutations([input]);

    expect("error" in result && result.error).toContain(message);
  });

  it("accepts status, body and delay overrides", () => {
    expect(
      parseMutations([
        {
          target: "dependency",
          op: "set",
          match: ` ${CHARGES} `,
          override: {
            status: 502,
            body: null,
            delayMs: 6000,
          },
        },
      ]),
    ).toEqual({
      mutations: [
        {
          target: "dependency",
          op: "set",
          match: CHARGES,
          override: {
            status: 502,
            body: null,
            delayMs: 6000,
          },
        },
      ],
    });
  });
});

describe("rewindFetch during a replay", () => {
  function captureSpy() {
    return vi.spyOn(rewind, "capture").mockResolvedValue({
      id: "evt_dep",
      timestamp: "2026-09-01T00:00:00.000Z",
      type: "http.dependency",
      title: CHARGES,
      status: "success",
    });
  }

  function inReplay<T>(replayPlan: ReplayPlan, callback: () => Promise<T>) {
    return runInExecution(
      {
        executionId: "exe_replay",
        eventId: "evt_root",
        replay: new DependencyReplayer(replayPlan),
      },
      callback,
    );
  }

  it("answers from the recording without calling the dependency", async () => {
    const capture = captureSpy();

    const network = vi.spyOn(globalThis, "fetch");

    const response = await inReplay(plan(), () =>
      rewindFetch("https://api.stripe.test/v1/charges", {
        method: "POST",
      }),
    );

    expect(network).not.toHaveBeenCalled();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "ch_1" });

    expect(capture.mock.calls[0][0].metadata).toMatchObject({
      dependency: {
        mode: "recorded",
      },
      response: {
        status: 201,
      },
    });
  });

  it("throws for blocked calls and records them as blocked", async () => {
    const capture = captureSpy();

    const network = vi.spyOn(globalThis, "fetch");

    await expect(
      inReplay(plan({ mode: "blocked" }), () =>
        rewindFetch("https://api.stripe.test/v1/charges", {
          method: "POST",
        }),
      ),
    ).rejects.toBeInstanceOf(DependencyBlockedError);

    expect(network).not.toHaveBeenCalled();

    expect(capture.mock.calls[0][0]).toMatchObject({
      status: "error",
      metadata: {
        dependency: {
          mode: "blocked",
        },
      },
    });
  });

  it("applies experiment delays", async () => {
    captureSpy();

    const started = performance.now();

    await inReplay(
      plan({
        dependencyMutations: [
          {
            target: "dependency",
            op: "set",
            match: CHARGES,
            override: {
              delayMs: 40,
            },
          },
        ],
      }),
      () =>
        rewindFetch("https://api.stripe.test/v1/charges", {
          method: "POST",
        }),
    );

    expect(performance.now() - started).toBeGreaterThanOrEqual(35);
  });
});

describe("withRewindCapture replay plans", () => {
  const replayHeaders = {
    "x-rewind-replay-id": "replay_11111111-2222-4333-8444-555555555555",
    "x-rewind-execution-id": "exe_0f0e0d0c-0b0a-4908-8706-050403020100",
  };

  function mockRewindAndDependency(planResponse: () => Response) {
    const dependencyCalls: string[] = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);

      if (url.includes("/plan")) {
        return planResponse();
      }

      if (url.endsWith("/api/events")) {
        return Response.json(
          {
            event: JSON.parse(String(init?.body)),
          },
          {
            status: 201,
          },
        );
      }

      dependencyCalls.push(url);

      return new Response("live!");
    });

    return dependencyCalls;
  }

  const handler = withRewindCapture(async () => {
    const response = await rewindFetch("https://api.stripe.test/v1/charges", {
      method: "POST",
    });

    return new Response(await response.text(), {
      status: response.status,
    });
  });

  it("follows the plan served by Rewind", async () => {
    const dependencyCalls = mockRewindAndDependency(() =>
      Response.json({
        plan: plan(),
      }),
    );

    const response = await handler(
      new NextRequest("http://localhost:3000/api/checkout", {
        method: "POST",
        headers: replayHeaders,
      }),
    );

    expect(dependencyCalls).toEqual([]);
    expect(response.status).toBe(201);
    expect(await response.text()).toBe(JSON.stringify({ id: "ch_1" }));
  });

  it("blocks every dependency when the plan cannot be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const dependencyCalls = mockRewindAndDependency(
      () => new Response("gone", { status: 404 }),
    );

    await expect(
      handler(
        new NextRequest("http://localhost:3000/api/checkout", {
          method: "POST",
          headers: replayHeaders,
        }),
      ),
    ).rejects.toBeInstanceOf(DependencyBlockedError);

    expect(dependencyCalls).toEqual([]);
  });

  it("calls dependencies live outside a replay", async () => {
    const dependencyCalls = mockRewindAndDependency(() =>
      Response.json({
        plan: plan(),
      }),
    );

    const response = await handler(
      new NextRequest("http://localhost:3000/api/checkout", {
        method: "POST",
      }),
    );

    expect(dependencyCalls).toEqual(["https://api.stripe.test/v1/charges"]);
    expect(await response.text()).toBe("live!");
  });
});
