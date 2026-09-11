import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

export type TestRunResult = {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: string;
};

type TestRunOptions = {
  cwd?: string;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;

const RUNNER_CONFIG = path.join(process.cwd(), "vitest.runner.config.ts");

export async function runVitestTest(
  filePath: string,
  options: TestRunOptions = {},
): Promise<TestRunResult> {
  const startTime = performance.now();

  try {
    const result = await execFileAsync(
      "npx",
      ["vitest", "run", "--config", RUNNER_CONFIG, filePath],
      {
        cwd: options.cwd ?? process.cwd(),

        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,

        maxBuffer: 1024 * 1024,
      },
    );

    const durationMs = Math.round(performance.now() - startTime);

    return {
      success: true,
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
      duration: `${durationMs}ms`,
    };
  } catch (error: unknown) {
    const durationMs = Math.round(performance.now() - startTime);

    const executionError = error as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
    };

    const exitCode =
      typeof executionError.code === "number" ? executionError.code : 1;

    return {
      success: false,
      exitCode,
      stdout: executionError.stdout ?? "",
      stderr: executionError.stderr ?? "",
      duration: `${durationMs}ms`,
    };
  }
}
