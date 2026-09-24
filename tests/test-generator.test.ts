import { describe, expect, it } from "vitest";

import {
  generatePlaywrightTest,
  generateVitestTest,
} from "@/lib/test-generator";

const event = {
  id: "evt_test_001",
  timestamp: "2026-09-11T18:00:00.000Z",
  type: "http.request" as const,
  title: "POST /api/test-capture",
  status: "success" as const,
  duration: "42ms",
  source: "test-api",

  metadata: {
    method: "POST",
    path: "/api/test-capture",
  },

  payload: {
    message: "Hello from Rewind",
    captured: true,
  },

  requestId: "req_test_001",
  traceId: null,
  sessionId: null,
  userId: "user_001",
};

const input = {
  event,
};

describe("test generator", () => {
  it("generates a Playwright test", () => {
    const code =
      generatePlaywrightTest(input);

    expect(code).toContain(
      'import { test, expect } from "@playwright/test";',
    );

    expect(code).toContain(
      'request.post(',
    );

    expect(code).toContain(
      '"/api/test-capture"',
    );

    expect(code).toContain(
      '"message": "Hello from Rewind"',
    );

    expect(code).toContain(
      "expect(response.ok()).toBeTruthy()",
    );
  });

  it("generates a Vitest test", () => {
    const code =
      generateVitestTest(input);

    expect(code).toContain(
      'import { describe, expect, it } from "vitest";',
    );

    expect(code).toContain(
      "fetch(",
    );

    expect(code).toContain(
      '"http://localhost:3000/api/test-capture"',
    );

    expect(code).toContain(
      '"message": "Hello from Rewind"',
    );

    expect(code).toContain(
      "expect(response.ok).toBe(true)",
    );
  });

  it("preserves the captured request path", () => {
    const playwright =
      generatePlaywrightTest(input);

    const vitest =
      generateVitestTest(input);

    expect(playwright).toContain(
      "/api/test-capture",
    );

    expect(vitest).toContain(
      "/api/test-capture",
    );
  });

  it("records where the test came from", () => {
    const code = generateVitestTest({
      event: {
        ...event,
        executionId: "exe_source",
      },
      fingerprintId: "fp_0123456789abcdef",
    });

    expect(code.startsWith("/**\n * Rewind regression test")).toBe(true);
    expect(code).toContain(
      " * Given: the request captured as evt_test_001, execution exe_source, failure fp_0123456789abcdef",
    );
    expect(code).toContain(" * Then:  it succeeds");
  });

  it("asserts HTTP invariants instead of a generic success check", () => {
    const invariants = [
      { id: "inv_1", kind: "http_status" as const, equals: 201 },
      {
        id: "inv_2",
        kind: "response_field" as const,
        path: "order.status",
        equals: "paid",
      },
      {
        id: "inv_3",
        kind: "max_event_count" as const,
        title: "POST https://api.stripe.test/v1/charges",
        max: 1,
      },
    ];

    const vitest = generateVitestTest({ event, invariants });

    expect(vitest).toContain("expect(response.status).toBe(201);");
    expect(vitest).not.toContain("expect(response.ok).toBe(true)");
    expect(vitest).toContain("const body = await response.json();");
    expect(vitest).toContain(
      'expect(body?.["order"]?.["status"]).toEqual("paid");',
    );
    expect(vitest).toContain(
      ' * Then:  HTTP status is 201; response.order.status is "paid"',
    );
    expect(vitest).toContain(
      ' * Also verified by Rewind replays: "POST https://api.stripe.test/v1/charges" happens at most 1 time',
    );

    const playwright = generatePlaywrightTest({ event, invariants });

    expect(playwright).toContain("expect(response.status()).toBe(201);");
    expect(playwright).not.toContain("expect(response.ok()).toBeTruthy()");
  });
});
