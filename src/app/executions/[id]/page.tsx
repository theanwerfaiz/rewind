import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import type { GraphNode } from "@/lib/event-graph";
import { parseDurationMs } from "@/lib/events";
import { getExecutionGraphById } from "@/lib/executions";
import { getReplayByResultExecutionId } from "@/lib/replays";

function getEventIcon(type: string) {
  switch (type) {
    case "webhook.received":
      return "↗";

    case "http.request":
      return "→";

    case "http.dependency":
      return "⇄";

    case "error":
      return "!";

    case "database.query":
      return "◇";

    case "agent.action":
      return "✦";

    case "command":
      return "$";

    case "deployment":
      return "▲";

    case "config.change":
      return "⚙";

    default:
      return "•";
  }
}

function statusDotClass(status: string) {
  switch (status) {
    case "success":
      return "bg-emerald-400";

    case "error":
      return "bg-red-400";

    default:
      return "bg-slate-500";
  }
}

function statusPillClass(status: string) {
  return status === "error"
    ? "border-red-500/30 bg-red-500/10 text-red-300"
    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
}

function formatMs(ms: number) {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 2)}s`;
  }

  return `${Math.round(ms)}ms`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0d1320] p-5">
      <div className="text-xs uppercase tracking-wider text-slate-600">
        {label}
      </div>

      <div
        title={value}
        className="mt-2 truncate font-mono text-sm text-slate-200"
      >
        {value}
      </div>
    </div>
  );
}

export default async function ExecutionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();

  const { id } = await params;

  const result = getExecutionGraphById(id);

  if (!result) {
    notFound();
  }

  const { execution, graph } = result;

  const replay = getReplayByResultExecutionId(execution.id);

  const startedAt = Date.parse(execution.startedAt);

  const totalMs = Math.max(Date.parse(execution.endedAt) - startedAt, 0);

  const scaleMs = Math.max(totalMs, 1);

  const failurePath = new Set(graph.failurePath);

  const nodesById = new Map(graph.nodes.map((node) => [node.event.id, node]));

  const firstFailure = graph.firstFailureId
    ? nodesById.get(graph.firstFailureId)
    : undefined;

  function timing(node: GraphNode) {
    const offsetMs = Math.max(Date.parse(node.event.timestamp) - startedAt, 0);

    const durationMs = parseDurationMs(node.event.duration) ?? 0;

    return {
      offsetMs,
      durationMs,
      left: Math.min((offsetMs / scaleMs) * 100, 100),
      width: Math.max((durationMs / scaleMs) * 100, 0.75),
    };
  }

  return (
    <main className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 flex items-center gap-4 text-sm">
          <Link
            href="/executions"
            className="text-slate-500 transition hover:text-slate-200"
          >
            ← All executions
          </Link>

          <Link
            href="/fingerprints"
            className="text-slate-500 transition hover:text-slate-200"
          >
            Failures
          </Link>

          {execution.rootEventId && (
            <Link
              href={`/events/${execution.rootEventId}`}
              className="text-slate-500 transition hover:text-slate-200"
            >
              Root event →
            </Link>
          )}

          {execution.rootEventId &&
            (execution.rootType === "http.request" ||
              execution.rootType === "webhook.received") && (
              <Link
                href={`/lab/${execution.rootEventId}`}
                className="text-blue-300 transition hover:text-blue-200"
              >
                Replay Lab →
              </Link>
            )}
        </div>

        <div className="mb-8">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs uppercase tracking-wider text-slate-400">
              Execution
            </span>

            <span
              className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wider ${statusPillClass(
                execution.status,
              )}`}
            >
              {execution.status}
            </span>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight">
            {execution.rootTitle ?? "Execution"}
          </h1>

          <p className="mt-2 break-all font-mono text-xs text-slate-500">
            {execution.id}
          </p>

          {replay && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.04] px-4 py-3 text-sm">
              <span className="text-blue-200">
                Replay{replay.label ? `: ${replay.label}` : ""}
              </span>

              {replay.sourceExecutionId && (
                <Link
                  href={`/executions/compare?original=${replay.sourceExecutionId}&candidate=${execution.id}`}
                  className="text-blue-300 hover:text-blue-200"
                >
                  Diff with original →
                </Link>
              )}

              <Link
                href={`/lab/${replay.eventId}`}
                className="text-slate-400 hover:text-slate-200"
              >
                Replay Lab
              </Link>
            </div>
          )}
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Duration" value={formatMs(totalMs)} />

          <Stat label="Events" value={String(execution.eventCount)} />

          <Stat label="Environment" value={execution.environment ?? "—"} />

          <Stat label="Trace ID" value={execution.traceId ?? "—"} />
        </div>

        {firstFailure && (
          <section className="mb-8 rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-red-400">
                Failure
              </div>

              {execution.fingerprintId && (
                <Link
                  href={`/fingerprints/${execution.fingerprintId}`}
                  className="rounded-lg border border-red-500/20 px-2.5 py-1 font-mono text-[11px] text-red-300 transition hover:border-red-400/40"
                >
                  {execution.fingerprintId} →
                </Link>
              )}
            </div>

            <h2 className="mt-2 text-lg font-medium text-red-100">
              {firstFailure.event.title}
            </h2>

            <p className="mt-1 text-xs text-red-300/70">
              Where the failure started, +
              {formatMs(timing(firstFailure).offsetMs)} into the execution.
              Path from the root:
            </p>

            <ol className="mt-5 flex flex-wrap items-center gap-2 text-xs">
              {graph.failurePath.map((eventId, index) => {
                const node = nodesById.get(eventId);

                if (!node) {
                  return null;
                }

                return (
                  <li key={eventId} className="flex items-center gap-2">
                    {index > 0 && <span className="text-red-400/50">→</span>}

                    <Link
                      href={`/events/${eventId}`}
                      className="rounded-lg border border-red-500/20 bg-black/20 px-2.5 py-1.5 text-red-100 transition hover:border-red-400/40"
                    >
                      {node.event.title}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <section className="rounded-2xl border border-white/[0.07] bg-[#0d1320] p-6">
          <div className="mb-5 flex items-end justify-between gap-4 border-b border-white/[0.06] pb-5">
            <div>
              <h2 className="text-sm font-medium text-slate-200">
                Execution Graph
              </h2>

              <p className="mt-1 text-xs text-slate-600">
                Events nested under the event that caused them, in the order
                they happened.
              </p>
            </div>

            <span className="shrink-0 font-mono text-[11px] text-slate-600">
              0 — {formatMs(totalMs)}
            </span>
          </div>

          <ol className="space-y-1">
            {graph.nodes.map((node) => {
              const { offsetMs, durationMs, left, width } = timing(node);

              const onFailurePath = failurePath.has(node.event.id);

              return (
                <li key={node.event.id}>
                  <Link
                    href={`/events/${node.event.id}`}
                    className={`group grid grid-cols-1 items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-white/[0.03] md:grid-cols-[minmax(0,1fr)_minmax(0,40%)] ${
                      onFailurePath ? "bg-red-500/[0.04]" : ""
                    }`}
                  >
                    <div
                      className="flex min-w-0 items-center gap-3"
                      style={{
                        paddingLeft: `${node.depth * 24}px`,
                      }}
                    >
                      {node.depth > 0 && (
                        <span className="-ml-3 font-mono text-xs text-slate-700">
                          └
                        </span>
                      )}

                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border font-mono text-xs ${
                          node.event.status === "error"
                            ? "border-red-500/30 text-red-300"
                            : "border-white/[0.08] text-slate-400 group-hover:text-white"
                        }`}
                      >
                        {getEventIcon(node.event.type)}
                      </span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm text-slate-200 group-hover:text-white">
                            {node.event.title}
                          </span>

                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(
                              node.event.status,
                            )}`}
                          />

                          {node.orphan && (
                            <span
                              title="This event names a parent that was not captured."
                              className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300"
                            >
                              missing parent
                            </span>
                          )}
                        </div>

                        <div className="mt-0.5 truncate text-xs text-slate-600">
                          {node.event.type}
                          {node.event.source ? ` • ${node.event.source}` : ""}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="relative h-2 flex-1 rounded-full bg-white/[0.04]">
                        <div
                          className={`absolute top-0 h-2 rounded-full ${
                            node.event.status === "error"
                              ? "bg-red-400/70"
                              : "bg-blue-400/60"
                          }`}
                          style={{
                            left: `${left}%`,
                            width: `${Math.min(width, 100 - left)}%`,
                            minWidth: "4px",
                          }}
                        />
                      </div>

                      <span className="w-28 shrink-0 text-right font-mono text-[11px] text-slate-600">
                        +{formatMs(offsetMs)}
                        {durationMs > 0 ? ` · ${formatMs(durationMs)}` : ""}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </main>
  );
}
