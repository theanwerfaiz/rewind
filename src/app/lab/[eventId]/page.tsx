import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ExperimentBuilder } from "@/components/lab/ExperimentBuilder";
import type { RewindHttpMetadata } from "@/lib/event-metadata";
import { getEventById, getEventsByExecutionId } from "@/lib/events";
import { describeMutation } from "@/lib/mutations";
import { getReplaysForEvent } from "@/lib/replays";

const REPLAYABLE_TYPES = new Set(["http.request", "webhook.received"]);

function formatDateTime(timestamp: string) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function statusClass(status: number | undefined) {
  if (status === undefined) {
    return "bg-white/10 text-slate-400";
  }

  return status < 400
    ? "bg-emerald-500/10 text-emerald-300"
    : "bg-red-500/10 text-red-300";
}

function Block({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-600">
        {label}
      </div>

      <pre className="max-h-64 overflow-auto rounded-xl border border-white/[0.07] bg-black/30 p-3 text-xs leading-5 text-slate-400">
        {value === undefined || value === null
          ? "—"
          : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default async function ReplayLabPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  await connection();

  const { eventId } = await params;

  const event = getEventById(eventId);

  if (!event || !REPLAYABLE_TYPES.has(event.type)) {
    notFound();
  }

  const metadata = event.metadata as RewindHttpMetadata | undefined;

  const experiments = getReplaysForEvent(event.id);

  const originalStatus = metadata?.response?.status;

  const dependencyEvents = event.executionId
    ? getEventsByExecutionId(event.executionId).filter(
        (candidate) => candidate.type === "http.dependency",
      )
    : [];

  const dependencyTitles = [
    ...new Set(dependencyEvents.map((dependency) => dependency.title)),
  ];

  return (
    <main className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex flex-wrap items-center gap-4 text-sm">
          <Link
            href={`/events/${event.id}`}
            className="text-slate-500 transition hover:text-slate-200"
          >
            ← Event
          </Link>

          {event.executionId && (
            <Link
              href={`/executions/${event.executionId}`}
              className="text-slate-500 transition hover:text-slate-200"
            >
              Original execution
            </Link>
          )}
        </div>

        <div className="mb-8">
          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs uppercase tracking-wider text-blue-300">
            Replay Lab
          </span>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {event.title}
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Branch this captured request into experiments. The original stays
            exactly as captured; every experiment is stored with its
            mutations and the execution it produced.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <section className="rounded-2xl border border-white/[0.07] bg-[#0d1320] p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Original
              </div>

              <span className="rounded bg-white/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                immutable
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-slate-200">
                {metadata?.method ?? "POST"} {metadata?.path ?? "—"}
              </span>

              {originalStatus !== undefined && (
                <span
                  className={`rounded px-2 py-0.5 font-mono text-xs ${statusClass(
                    originalStatus,
                  )}`}
                >
                  {originalStatus}
                </span>
              )}
            </div>

            <div className="mt-4 space-y-4">
              <Block label="Payload" value={event.payload} />

              <Block label="Headers (redacted)" value={metadata?.headers} />

              <div>
                <div className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-600">
                  Recorded dependencies
                </div>

                {dependencyEvents.length === 0 ? (
                  <p className="text-xs text-slate-600">
                    None recorded. Use rewindFetch in the application to record
                    outgoing calls.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {dependencyEvents.map((dependency) => {
                      const response = (
                        dependency.metadata as
                          | { response?: { status?: number } }
                          | undefined
                      )?.response;

                      return (
                        <li
                          key={dependency.id}
                          className="flex items-center gap-2 font-mono text-[11px] text-slate-400"
                        >
                          <span
                            className={`rounded px-1.5 ${statusClass(
                              response?.status,
                            )}`}
                          >
                            {response?.status ?? "ERR"}
                          </span>
                          <span className="truncate">{dependency.title}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <ExperimentBuilder
            eventId={event.id}
            dependencies={dependencyTitles}
          />
        </div>

        <section className="mt-8 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d1320]">
          <div className="border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-sm font-medium text-slate-200">
              Experiments
            </h2>

            <p className="mt-0.5 text-xs text-slate-600">
              Every replay of this request, newest first.
            </p>
          </div>

          {experiments.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-slate-600">
              No experiments yet.
            </p>
          ) : (
            experiments.map((experiment) => (
              <div
                key={experiment.id}
                className="flex flex-col gap-3 border-b border-white/[0.05] px-5 py-4 last:border-0 md:flex-row md:items-center"
              >
                <span
                  className={`w-12 shrink-0 rounded px-2 py-0.5 text-center font-mono text-xs ${statusClass(
                    experiment.status,
                  )}`}
                >
                  {experiment.status}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-200">
                    {experiment.label ??
                      (experiment.mutations.length === 0
                        ? "Plain replay"
                        : "Unlabelled experiment")}
                  </div>

                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {experiment.mutations.length === 0 ? (
                      <span className="text-[11px] text-slate-600">
                        no mutations
                      </span>
                    ) : (
                      experiment.mutations.map((mutation, index) => (
                        <code
                          key={index}
                          className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[11px] text-blue-200"
                        >
                          {describeMutation(mutation)}
                        </code>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-4 text-xs">
                  {experiment.dependencyMode && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                        experiment.dependencyMode === "live"
                          ? "bg-amber-500/10 text-amber-300"
                          : "bg-white/[0.05] text-slate-500"
                      }`}
                    >
                      deps {experiment.dependencyMode}
                    </span>
                  )}

                  <span className="font-mono text-slate-600">
                    {experiment.duration}
                  </span>

                  <span className="text-slate-600">
                    {formatDateTime(experiment.createdAt)}
                  </span>

                  {experiment.resultExecutionId && (
                    <Link
                      href={`/executions/${experiment.resultExecutionId}`}
                      className="text-blue-300 hover:text-blue-200"
                    >
                      Execution
                    </Link>
                  )}

                  {experiment.resultExecutionId &&
                    experiment.sourceExecutionId && (
                      <Link
                        href={`/executions/compare?original=${experiment.sourceExecutionId}&candidate=${experiment.resultExecutionId}`}
                        className="text-blue-300 hover:text-blue-200"
                      >
                        Diff
                      </Link>
                    )}

                  <Link
                    href={`/replays/${experiment.id}`}
                    className="text-slate-400 hover:text-slate-200"
                  >
                    Compare
                  </Link>
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
