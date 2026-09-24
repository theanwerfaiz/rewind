import Link from "next/link";
import { connection } from "next/server";

import { getExecutions } from "@/lib/executions";
import { PageHeader } from "@/components/ui/PageHeader";

function formatDateTime(timestamp: string) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(startedAt: string, endedAt: string) {
  const ms = Math.max(Date.parse(endedAt) - Date.parse(startedAt), 0);

  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

export default async function ExecutionsPage() {
  await connection();

  const executions = getExecutions(200);

  // Replays and experiments are not real failures.
  const failed = executions.filter(
    (execution) => execution.status === "error" && !execution.isReplay,
  ).length;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Monitor" }, { label: "Executions" }]}
        title="Executions"
        description="Each execution is one request or webhook and every event it caused. Open one to see its execution graph."
        meta={
          <>
            <span>{executions.length} recent</span>

            {failed > 0 && (
              <Link
                href="/fingerprints"
                className="text-failure hover:brightness-125"
              >
                {failed} failed · view failures
              </Link>
            )}
          </>
        }
      />

        {executions.length === 0 ? (
          <div className="rounded-2xl border border-line bg-panel p-16 text-center">
            <div className="text-3xl text-faint">◷</div>

            <h2 className="mt-4 text-sm font-medium text-ink-2">
              No executions yet
            </h2>

            <p className="mx-auto mt-1 max-w-sm text-xs text-faint">
              Capture your first request to create an execution you can replay
              and turn into a test.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-panel">
            {executions.map((execution) => (
              <Link
                key={execution.id}
                href={`/executions/${execution.id}`}
                className="group flex items-center gap-4 border-b border-line px-5 py-4 transition last:border-0 hover:bg-panel"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    execution.status === "error"
                      ? "bg-failure"
                      : "bg-success"
                  }`}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm text-ink group-hover:text-ink">
                      {execution.rootTitle ?? "Untitled execution"}
                    </span>

                    {execution.isReplay && (
                      <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-xs uppercase tracking-wider text-accent">
                        replay
                      </span>
                    )}

                    {execution.capsuleId && (
                      <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-xs uppercase tracking-wider text-accent">
                        imported
                      </span>
                    )}
                  </div>

                  <div className="mt-0.5 truncate font-mono text-xs text-faint">
                    {execution.id}
                  </div>
                </div>

                <span className="hidden shrink-0 text-xs text-muted sm:block">
                  {execution.eventCount}{" "}
                  {execution.eventCount === 1 ? "event" : "events"}
                </span>

                <span className="w-20 shrink-0 text-right font-mono text-xs text-muted">
                  {formatDuration(execution.startedAt, execution.endedAt)}
                </span>

                <span className="hidden w-36 shrink-0 text-right text-xs text-faint md:block">
                  {formatDateTime(execution.startedAt)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </>
  );
}
