import Link from "next/link";
import { connection } from "next/server";

import { VerifyButton } from "@/components/verifications/VerifyButton";
import { getVerificationRuns } from "@/lib/verification";

const OUTCOME_LABELS: Record<string, string> = {
  fixed: "fixed",
  still_failing: "still failing",
  different_failure: "fails differently",
  regressed: "regressed",
  behavior_changed: "behaviour changed",
  unchanged: "unchanged",
};

function formatDateTime(timestamp: string) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default async function VerificationsPage() {
  await connection();

  const runs = getVerificationRuns(20);

  return (
    <main className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Link
          href="/executions"
          className="text-sm text-slate-500 transition hover:text-slate-200"
        >
          ← Executions
        </Link>

        <div className="mb-8 mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Verifications
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Real executions replayed against a candidate build, with
              dependencies answered from their recordings. A historical failure
              passes when it no longer reproduces; a success passes when it
              still succeeds. In CI, run{" "}
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-slate-300">
                npm run verify
              </code>
              .
            </p>
          </div>

          <VerifyButton />
        </div>

        {runs.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.07] bg-[#0d1320] p-16 text-center">
            <h2 className="text-sm font-medium text-slate-300">
              No verification runs yet
            </h2>

            <p className="mx-auto mt-1 max-w-sm text-xs text-slate-600">
              Verify recorded failures to prove they stay fixed.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {runs.map((run) => (
              <section
                key={run.id}
                className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d1320]"
              >
                <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-5 py-4">
                  <span
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${
                      run.failed === 0
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-red-500/10 text-red-300"
                    }`}
                  >
                    {run.failed === 0 ? "pass" : "fail"}
                  </span>

                  <span className="text-sm text-slate-200">
                    {run.passed}/{run.total} verified
                  </span>

                  {run.codeVersion && (
                    <span className="font-mono text-xs text-slate-400">
                      {run.codeVersion}
                    </span>
                  )}

                  <span className="ml-auto text-xs text-slate-600">
                    {run.target} · {formatDateTime(run.createdAt)}
                  </span>
                </div>

                {run.results.map((result, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-1 border-b border-white/[0.04] px-5 py-3 last:border-0 md:flex-row md:items-center md:gap-4"
                  >
                    <span
                      className={`w-10 shrink-0 font-mono text-xs ${
                        result.verdict === "pass"
                          ? "text-emerald-400"
                          : "text-red-400"
                      }`}
                    >
                      {result.verdict.toUpperCase()}
                    </span>

                    <span className="w-36 shrink-0 text-xs text-slate-400">
                      {result.outcome
                        ? (OUTCOME_LABELS[result.outcome] ?? result.outcome)
                        : "not run"}
                    </span>

                    <Link
                      href={`/executions/${result.executionId}`}
                      className="min-w-0 flex-1 truncate text-sm text-slate-200 hover:text-white"
                    >
                      {result.title}
                    </Link>

                    {result.resultExecutionId ? (
                      <Link
                        href={`/executions/compare?original=${result.executionId}&candidate=${result.resultExecutionId}`}
                        className="shrink-0 text-xs text-blue-300 hover:text-blue-200"
                      >
                        Diff
                      </Link>
                    ) : (
                      <span className="shrink-0 text-xs text-slate-600">
                        {result.reason}
                      </span>
                    )}
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
