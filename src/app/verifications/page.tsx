import Link from "next/link";
import { connection } from "next/server";

import { VerifyButton } from "@/components/verifications/VerifyButton";
import { getVerificationRuns } from "@/lib/verification";
import { PageHeader } from "@/components/ui/PageHeader";

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
    <>
      <PageHeader
        crumbs={[{ label: "Prevent" }, { label: "Verifications" }]}
        title="Verifications"
        description={
          <>
            Real executions replayed against a candidate build, with
            dependencies answered from their recordings. A historical failure
            passes when it no longer reproduces; a success passes when it still
            succeeds. In CI, run{" "}
            <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-ink-2">
              npm run verify
            </code>
            .
          </>
        }
        actions={<VerifyButton />}
      />

        {runs.length === 0 ? (
          <div className="rounded-2xl border border-line bg-panel p-16 text-center">
            <h2 className="text-sm font-medium text-ink-2">
              No verification runs yet
            </h2>

            <p className="mx-auto mt-1 max-w-sm text-xs text-faint">
              Verify recorded failures to prove they stay fixed.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {runs.map((run) => (
              <section
                key={run.id}
                className="overflow-hidden rounded-2xl border border-line bg-panel"
              >
                <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
                  <span
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${
                      run.failed === 0
                        ? "bg-success-soft text-success"
                        : "bg-failure-soft text-failure"
                    }`}
                  >
                    {run.failed === 0 ? "pass" : "fail"}
                  </span>

                  <span className="text-sm text-ink">
                    {run.passed}/{run.total} verified
                  </span>

                  {run.codeVersion && (
                    <span className="font-mono text-xs text-ink-2">
                      {run.codeVersion}
                    </span>
                  )}

                  <span className="ml-auto text-xs text-faint">
                    {run.target} · {formatDateTime(run.createdAt)}
                  </span>
                </div>

                {run.results.map((result, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-1 border-b border-line px-5 py-3 last:border-0 md:flex-row md:items-center md:gap-4"
                  >
                    <span
                      className={`w-10 shrink-0 font-mono text-xs ${
                        result.verdict === "pass"
                          ? "text-success"
                          : "text-failure"
                      }`}
                    >
                      {result.verdict.toUpperCase()}
                    </span>

                    <span className="w-36 shrink-0 text-xs text-ink-2">
                      {result.outcome
                        ? (OUTCOME_LABELS[result.outcome] ?? result.outcome)
                        : "not run"}
                    </span>

                    <Link
                      href={`/executions/${result.executionId}`}
                      className="min-w-0 flex-1 truncate text-sm text-ink hover:text-ink"
                    >
                      {result.title}
                    </Link>

                    {result.resultExecutionId ? (
                      <Link
                        href={`/executions/compare?original=${result.executionId}&candidate=${result.resultExecutionId}`}
                        className="shrink-0 text-xs text-accent hover:text-accent"
                      >
                        Diff
                      </Link>
                    ) : (
                      <span className="shrink-0 text-xs text-faint">
                        {result.reason}
                      </span>
                    )}
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </>
  );
}
