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
});