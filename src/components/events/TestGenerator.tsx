"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type TestGeneratorProps = {
  eventId: string;
  eventType: string;
};

type Framework = "playwright" | "vitest";

type TestRunResult = {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: string;
};

export function TestGenerator({ eventId, eventType }: TestGeneratorProps) {
  const router = useRouter();

  const [framework, setFramework] = useState<Framework>("playwright");

  const [loading, setLoading] = useState(false);

  const [running, setRunning] = useState(false);

  const [code, setCode] = useState<string | null>(null);

  const [filename, setFilename] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [runError, setRunError] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);

  const [runResult, setRunResult] = useState<TestRunResult | null>(null);

  if (eventType !== "http.request") {
    return null;
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setRunError(null);
    setCode(null);
    setFilename(null);
    setCopied(false);
    setRunResult(null);

    try {
      const response = await fetch("/api/test-generator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId,
          framework,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to generate test");
      }

      setCode(data.code);
      setFilename(data.filename);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to generate test",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRun() {
    if (!code) {
      return;
    }

    setRunning(true);
    setRunError(null);
    setRunResult(null);

    try {
      const response = await fetch("/api/test-runner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          framework,
          code,
          eventId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to execute test");
      }

      setRunResult({
        success: Boolean(data.success),
        exitCode: typeof data.exitCode === "number" ? data.exitCode : 1,
        stdout: typeof data.stdout === "string" ? data.stdout : "",
        stderr: typeof data.stderr === "string" ? data.stderr : "",
        duration: typeof data.duration === "string" ? data.duration : "—",
      });

      // The run is recorded against this event; show it in the history.
      router.refresh();
    } catch (error) {
      setRunError(
        error instanceof Error ? error.message : "Failed to execute test",
      );
    } finally {
      setRunning(false);
    }
  }

  async function handleCopy() {
    if (!code) {
      return;
    }

    await navigator.clipboard.writeText(code);

    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 2000);
  }

  return (
    <section className="mt-6 rounded-2xl border border-line bg-panel p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-medium">Generate Test</h2>

          <p className="mt-1 text-sm text-muted">
            Turn this captured request into a repeatable regression test.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setFramework("playwright");
              setRunResult(null);
              setRunError(null);
            }}
            className={`rounded-lg border px-3 py-2 text-xs transition ${
              framework === "playwright"
                ? "border-line-strong bg-hover text-ink"
                : "border-line bg-panel text-muted hover:text-ink-2"
            }`}
          >
            Playwright
          </button>

          <button
            type="button"
            onClick={() => {
              setFramework("vitest");
              setRunResult(null);
              setRunError(null);
            }}
            className={`rounded-lg border px-3 py-2 text-xs transition ${
              framework === "vitest"
                ? "border-line-strong bg-hover text-ink"
                : "border-line bg-panel text-muted hover:text-ink-2"
            }`}
          >
            Vitest
          </button>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Generating..." : "Generate Test"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-5 rounded-xl border border-failure/20 bg-failure-soft p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-failure">
            Generation failed
          </div>

          <p className="mt-2 text-sm text-failure">{error}</p>
        </div>
      )}

      {code && (
        <div className="mt-6">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-faint">
                Generated test
              </div>

              <div className="mt-1 font-mono text-xs text-ink-2">
                {filename}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {framework === "vitest" && (
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={running}
                  className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {running ? "Running..." : "Run Test"}
                </button>
              )}

              <button
                type="button"
                onClick={handleCopy}
                className="rounded-lg border border-line bg-panel px-3 py-2 text-xs text-ink-2 transition hover:bg-raised hover:text-ink"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <pre className="max-h-[500px] overflow-auto rounded-xl border border-line bg-black/40 p-5 text-sm leading-6 text-ink-2">
            {code}
          </pre>

          {runError && (
            <div className="mt-5 rounded-xl border border-failure/20 bg-failure-soft p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-failure">
                Execution failed
              </div>

              <p className="mt-2 text-sm text-failure">{runError}</p>
            </div>
          )}

          {runResult && (
            <div className="mt-5 overflow-hidden rounded-xl border border-line bg-canvas">
              <div className="flex flex-col gap-4 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                      runResult.success
                        ? "bg-success-soft text-success"
                        : "bg-failure-soft text-failure"
                    }`}
                  >
                    {runResult.success ? "✓" : "×"}
                  </div>

                  <div>
                    <div
                      className={`text-sm font-medium ${
                        runResult.success ? "text-success" : "text-failure"
                      }`}
                    >
                      {runResult.success ? "Test passed" : "Test failed"}
                    </div>

                    <div className="mt-1 text-xs text-muted">
                      Exit code {runResult.exitCode}
                      {" · "}
                      {runResult.duration}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRun}
                  disabled={running}
                  className="rounded-lg border border-line bg-panel px-3 py-2 text-xs text-ink-2 transition hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {running ? "Running..." : "Run Again"}
                </button>
              </div>

              {runResult.stdout && (
                <div className="border-b border-line p-4">
                  <div className="mb-2 text-xs uppercase tracking-wider text-faint">
                    stdout
                  </div>

                  <pre className="max-h-[300px] overflow-auto rounded-lg bg-black/40 p-4 font-mono text-xs leading-5 text-ink-2">
                    {runResult.stdout}
                  </pre>
                </div>
              )}

              {runResult.stderr && (
                <div className="p-4">
                  <div className="mb-2 text-xs uppercase tracking-wider text-faint">
                    stderr
                  </div>

                  <pre className="max-h-[300px] overflow-auto rounded-lg bg-black/40 p-4 font-mono text-xs leading-5 text-failure">
                    {runResult.stderr}
                  </pre>
                </div>
              )}

              {!runResult.stdout && !runResult.stderr && (
                <div className="p-4 text-xs text-muted">
                  No output was produced.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
