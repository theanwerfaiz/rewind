import { afterEach, describe, expect, it } from "vitest";

import fs from "node:fs";
import path from "node:path";

import { runVitestTest } from "@/lib/test-runner";

const temporaryRoot = path.join(process.cwd(), "rewind-test-runs");

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories) {
    fs.rmSync(directory, {
      recursive: true,
      force: true,
    });
  }

  temporaryDirectories.length = 0;
});

function createTestFile(name: string, content: string) {
  const temporaryDirectory = path.join(
    temporaryRoot,
    `unit-${crypto.randomUUID()}`,
  );

  temporaryDirectories.push(temporaryDirectory);

  fs.mkdirSync(temporaryDirectory, {
    recursive: true,
  });

  const filePath = path.join(temporaryDirectory, name);

  fs.writeFileSync(filePath, content, "utf8");

  return filePath;
}

describe("runVitestTest", () => {
  it("returns success for a passing test", async () => {
    const filePath = createTestFile(
      "passing.test.ts",
      `
              import { expect, it } from "vitest";

              it("passes", () => {
                expect(1 + 1).toBe(2);
              });
            `,
    );

    const result = await runVitestTest(filePath);

    expect(result.success).toBe(true);

    expect(result.exitCode).toBe(0);

    expect(result.stdout).toContain("1 passed");

    expect(result.duration).toMatch(/^\d+ms$/);
  });

  it("returns failure for a failing test", async () => {
    const filePath = createTestFile(
      "failing.test.ts",
      `
              import { expect, it } from "vitest";

              it("fails", () => {
                expect(1).toBe(2);
              });
            `,
    );

    const result = await runVitestTest(filePath);

    expect(result.success).toBe(false);

    expect(result.exitCode).not.toBe(0);

    expect(result.stdout + result.stderr).toContain("expected");

    expect(result.duration).toMatch(/^\d+ms$/);
  });

  it("returns failure when the test file does not exist", async () => {
    const temporaryDirectory = path.join(
      temporaryRoot,
      `unit-${crypto.randomUUID()}`,
    );

    temporaryDirectories.push(temporaryDirectory);

    const filePath = path.join(temporaryDirectory, "does-not-exist.test.ts");

    const result = await runVitestTest(filePath);

    expect(result.success).toBe(false);

    expect(result.exitCode).not.toBe(0);
  });
});
