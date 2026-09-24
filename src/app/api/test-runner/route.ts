import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@/lib/request-body";
import fs from "node:fs/promises";
import path from "node:path";

import { runVitestTest } from "@/lib/test-runner";
import { recordTestRun } from "@/lib/test-runs";

type TestRunnerRequest = {
  framework?: string;
  code?: string;
  /** The event the test reproduces; the run is recorded against it. */
  eventId?: string;
};

const TEMP_DIRECTORY = path.join(process.cwd(), "rewind-test-runs");

const ALLOWED_FRAMEWORKS = new Set(["vitest"]);

const MAX_CODE_LENGTH = 100_000;

function createTestFileName() {
  return `rewind-${crypto.randomUUID()}.test.ts`;
}

export async function POST(request: NextRequest) {
  let body: TestRunnerRequest;

  try {
    body = (await readJsonBody(request)) as TestRunnerRequest;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid JSON request body.",
      },
      {
        status: 400,
      },
    );
  }

  const framework = body.framework ?? "vitest";

  if (!ALLOWED_FRAMEWORKS.has(framework)) {
    return NextResponse.json(
      {
        success: false,
        error: "Unsupported test framework.",
      },
      {
        status: 400,
      },
    );
  }

  if (typeof body.code !== "string" || body.code.trim().length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "Test code is required.",
      },
      {
        status: 400,
      },
    );
  }

  if (body.code.length > MAX_CODE_LENGTH) {
    return NextResponse.json(
      {
        success: false,
        error: "Test code is too large.",
      },
      {
        status: 400,
      },
    );
  }

  const fileName = createTestFileName();

  const filePath = path.join(TEMP_DIRECTORY, fileName);

  try {
    await fs.mkdir(TEMP_DIRECTORY, {
      recursive: true,
    });

    await fs.writeFile(filePath, body.code, "utf8");

    const result = await runVitestTest(filePath);

    const testRun =
      typeof body.eventId === "string"
        ? recordTestRun(body.eventId, framework, result)
        : null;

    return NextResponse.json({
      testRunId: testRun?.id ?? null,
      success: result.success,
      framework,
      filename: fileName,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      duration: result.duration,
    });
  } catch (error) {
    console.error("Test execution failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Test execution failed.",
      },
      {
        status: 500,
      },
    );
  } finally {
    await fs.rm(filePath, {
      force: true,
    });
  }
}
