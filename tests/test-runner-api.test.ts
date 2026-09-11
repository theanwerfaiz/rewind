import { afterEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import { POST } from "@/app/api/test-runner/route";

const temporaryDirectory = ".rewind-test-runs";

afterEach(async () => {
  vi.restoreAllMocks();

  const fs = await import("node:fs/promises");

  await fs.rm(temporaryDirectory, {
    recursive: true,
    force: true,
  });
});

function createRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/test-runner", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/test-runner", () => {
  it("executes a passing Vitest test", async () => {
    const response = await POST(
      createRequest({
        framework: "vitest",
        code: `
                import { expect, it } from "vitest";

                it("passes", () => {
                  expect(2 + 2).toBe(4);
                });
              `,
      }),
    );

    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data.success).toBe(true);

    expect(data.framework).toBe("vitest");

    expect(data.exitCode).toBe(0);

    expect(data.stdout).toContain("1 passed");

    expect(data.filename).toMatch(/^rewind-[a-f0-9-]+\.test\.ts$/);
  });

  it("returns failure for a failing Vitest test", async () => {
    const response = await POST(
      createRequest({
        framework: "vitest",
        code: `
                import { expect, it } from "vitest";

                it("fails", () => {
                  expect(1).toBe(2);
                });
              `,
      }),
    );

    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data.success).toBe(false);

    expect(data.exitCode).not.toBe(0);

    expect(data.stdout + data.stderr).toContain("expected");
  });

  it("rejects unsupported frameworks", async () => {
    const response = await POST(
      createRequest({
        framework: "playwright",
        code: `
                console.log("test");
              `,
      }),
    );

    expect(response.status).toBe(400);

    const data = await response.json();

    expect(data.success).toBe(false);

    expect(data.error).toBe("Unsupported test framework.");
  });

  it("rejects missing test code", async () => {
    const response = await POST(
      createRequest({
        framework: "vitest",
      }),
    );

    expect(response.status).toBe(400);

    const data = await response.json();

    expect(data.success).toBe(false);

    expect(data.error).toBe("Test code is required.");
  });

  it("rejects oversized test code", async () => {
    const response = await POST(
      createRequest({
        framework: "vitest",
        code: "x".repeat(100_001),
      }),
    );

    expect(response.status).toBe(400);

    const data = await response.json();

    expect(data.success).toBe(false);

    expect(data.error).toBe("Test code is too large.");
  });
});
