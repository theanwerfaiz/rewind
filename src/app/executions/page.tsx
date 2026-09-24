import Link from "next/link";
import { connection } from "next/server";

import { getExecutions } from "@/lib/executions";

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

  const failed = executions.filter(
    (execution) => execution.status === "error",
  ).length;

  return (
    <main className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <Link
              href="/"
              className="text-slate-500 transition hover:text-slate-200"
            >
              ← Back to events
            </Link>

            <Link
              href="/fingerprints"
              className="text-slate-500 transition hover:text-slate-200"
            >
              Failures
            </Link>

            <Link
              href="/capsules"
              className="text-slate-500 transition hover:text-slate-200"
            >
              Capsules
            </Link>
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">
                Executions
              </h1>

              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-500">
                {executions.length} recent
              </span>

              {failed > 0 && (
                <Link
                  href="/fingerprints"
                  className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs text-red-300 transition hover:border-red-400/40"
                >
                  {failed} failed · view failures →
                </Link>
              )}
            </div>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Each execution is one request or webhook and every event it
              caused. Open one to see its execution graph.
            </p>
          </div>
        </div>

        {executions.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.07] bg-[#0d1320] p-16 text-center">
            <div className="text-3xl text-slate-700">◷</div>

            <h2 className="mt-4 text-sm font-medium text-slate-300">
              No executions yet
            </h2>

            <p className="mx-auto mt-1 max-w-sm text-xs text-slate-600">
              Capture your first request to create an execution you can replay
              and turn into a test.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d1320]">
            {executions.map((execution) => (
              <Link
                key={execution.id}
                href={`/executions/${execution.id}`}
                className="group flex items-center gap-4 border-b border-white/[0.05] px-5 py-4 transition last:border-0 hover:bg-white/[0.03]"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    execution.status === "error"
                      ? "bg-red-400"
                      : "bg-emerald-400"
                  }`}
                />

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-200 group-hover:text-white">
                    {execution.rootTitle ?? "Untitled execution"}
                  </div>

                  <div className="mt-0.5 truncate font-mono text-[11px] text-slate-600">
                    {execution.id}
                  </div>
                </div>

                <span className="hidden shrink-0 text-xs text-slate-500 sm:block">
                  {execution.eventCount}{" "}
                  {execution.eventCount === 1 ? "event" : "events"}
                </span>

                <span className="w-20 shrink-0 text-right font-mono text-xs text-slate-500">
                  {formatDuration(execution.startedAt, execution.endedAt)}
                </span>

                <span className="hidden w-36 shrink-0 text-right text-xs text-slate-600 md:block">
                  {formatDateTime(execution.startedAt)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
