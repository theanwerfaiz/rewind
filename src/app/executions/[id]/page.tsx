import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { InvestigationPanel } from "@/components/executions/InvestigationPanel";
import {
  InvariantPanel,
  type InvariantSuggestion,
} from "@/components/executions/InvariantPanel";
import type { GraphNode } from "@/lib/event-graph";
import { parseDurationMs } from "@/lib/events";
import { getExecutionGraphById } from "@/lib/executions";
import { getInvariantsForExecution } from "@/lib/invariant-store";
import { buildInvestigation } from "@/lib/investigation";
import {
  describeInvariant,
  evaluateInvariants,
  type InvariantDefinition,
} from "@/lib/invariants";
import { getReplayByResultExecutionId } from "@/lib/replays";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, StatusBadge } from "@/components/ui/StatusBadge";
import { IdChip } from "@/components/ui/IdChip";
import { ButtonLink } from "@/components/ui/primitives";
import { shortId } from "@/lib/format";

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
      return "bg-success";

    case "error":
      return "bg-failure";

    default:
      return "bg-faint";
  }
}

function formatMs(ms: number) {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 2)}s`;
  }

  return `${Math.round(ms)}ms`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5">
      <div className="text-xs uppercase tracking-wider text-faint">
        {label}
      </div>

      <div
        title={value}
        className="mt-2 truncate font-mono text-sm text-ink"
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

  const invariants = getInvariantsForExecution(execution.id);

  // Replays and experiments are investigated through their original.
  const investigation = execution.isReplay
    ? null
    : buildInvestigation(execution.id);

  const invariantResults = evaluateInvariants(invariants, {
    status: execution.status,
    startedAt: execution.startedAt,
    endedAt: execution.endedAt,
    rootEventId: execution.rootEventId,
    events: result.events,
  });

  // One-click invariants drawn from this execution's own behaviour.
  const suggestedDefinitions: InvariantDefinition[] = [];

  if (execution.rootType === "http.request") {
    suggestedDefinitions.push({
      kind: "http_status",
      equals: 200,
    });
  }

  suggestedDefinitions.push({
    kind: "no_unhandled_errors",
  });

  for (const title of new Set(
    result.events
      .filter((event) => event.type === "http.dependency")
      .map((event) => event.title),
  )) {
    suggestedDefinitions.push({
      kind: "max_event_count",
      title,
      max: 1,
    });
  }

  const originEvent = graph.firstFailureId
    ? result.events.find((event) => event.id === graph.firstFailureId)
    : undefined;

  // Only a dedicated error event should never happen; a failed call (an
  // HTTP request or dependency) should still happen, just succeed.
  if (originEvent?.type === "error") {
    suggestedDefinitions.push({
      kind: "event_absent",
      title: originEvent.title,
    });
  }

  const invariantSuggestions: InvariantSuggestion[] = suggestedDefinitions
    .slice(0, 6)
    .map((definition) => ({
      description: describeInvariant(definition),
      definition,
    }));

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
    <>
      <PageHeader
        crumbs={[
          { label: "Executions", href: "/executions" },
          { label: shortId(execution.id) },
        ]}
        badges={
          <>
            <StatusBadge status={execution.status} />
            {execution.isReplay && <Badge tone="accent">replay</Badge>}
            {execution.capsuleId && <Badge tone="accent">imported</Badge>}
          </>
        }
        title={execution.rootTitle ?? "Execution"}
        meta={<IdChip id={execution.id} full />}
        actions={
          <>
            {execution.rootEventId && (
              <ButtonLink href={`/events/${execution.rootEventId}`} variant="ghost">
                Root event
              </ButtonLink>
            )}

            <ButtonLink href={`/executions/${execution.id}/capsule`}>
              Capsule
            </ButtonLink>

            {execution.rootEventId &&
              (execution.rootType === "http.request" ||
                execution.rootType === "webhook.received") && (
                <ButtonLink href={`/lab/${execution.rootEventId}`} variant="primary">
                  Replay Lab
                </ButtonLink>
              )}
          </>
        }
      />

      <div className="mb-6 space-y-3 empty:hidden">

          {execution.capsuleId && (
            <div className="mt-4 rounded-xl border border-accent/20 bg-accent-soft px-4 py-3 text-sm text-accent">
              Imported from capsule{" "}
              <span className="font-mono text-xs">{execution.capsuleId}</span>
            </div>
          )}

          {replay && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent/20 bg-accent-soft px-4 py-3 text-sm">
              <span className="text-accent">
                Replay{replay.label ? `: ${replay.label}` : ""}
              </span>

              {replay.sourceExecutionId && (
                <Link
                  href={`/executions/compare?original=${replay.sourceExecutionId}&candidate=${execution.id}`}
                  className="text-accent hover:text-accent"
                >
                  Diff with original →
                </Link>
              )}

              <Link
                href={`/lab/${replay.eventId}`}
                className="text-ink-2 hover:text-ink"
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
          <section className="mb-8 rounded-2xl border border-failure/20 bg-failure-soft p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-failure">
                Failure
              </div>

              {execution.fingerprintId && (
                <Link
                  href={`/fingerprints/${execution.fingerprintId}`}
                  className="rounded-lg border border-failure/20 px-2.5 py-1 font-mono text-xs text-failure transition hover:border-failure/40"
                >
                  {execution.fingerprintId} →
                </Link>
              )}
            </div>

            <h2 className="mt-2 text-lg font-medium text-failure">
              {firstFailure.event.title}
            </h2>

            <p className="mt-1 text-xs text-failure">
              Where the failure started, +
              {formatMs(timing(firstFailure).offsetMs)} into the execution. Path
              from the root:
            </p>

            <ol className="mt-5 flex flex-wrap items-center gap-2 text-xs">
              {graph.failurePath.map((eventId, index) => {
                const node = nodesById.get(eventId);

                if (!node) {
                  return null;
                }

                return (
                  <li key={eventId} className="flex items-center gap-2">
                    {index > 0 && <span className="text-failure">→</span>}

                    <Link
                      href={`/events/${eventId}`}
                      className="rounded-lg border border-failure/20 bg-canvas px-2.5 py-1.5 text-failure transition hover:border-failure/40"
                    >
                      {node.event.title}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {investigation && <InvestigationPanel investigation={investigation} />}

        <InvariantPanel
          executionId={execution.id}
          items={invariants.map((invariant, index) => ({
            id: invariant.id,
            description: describeInvariant(invariant),
            passed: invariantResults[index].passed,
            actual: invariantResults[index].actual,
          }))}
          suggestions={invariantSuggestions}
        />

        <section className="rounded-2xl border border-line bg-panel p-6">
          <div className="mb-5 flex items-end justify-between gap-4 border-b border-line pb-5">
            <div>
              <h2 className="text-sm font-medium text-ink">
                Execution Graph
              </h2>

              <p className="mt-1 text-xs text-faint">
                Events nested under the event that caused them, in the order
                they happened.
              </p>
            </div>

            <span className="shrink-0 font-mono text-xs text-faint">
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
                    className={`group grid grid-cols-1 items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-panel md:grid-cols-[minmax(0,1fr)_minmax(0,40%)] ${
                      onFailurePath ? "bg-failure-soft" : ""
                    }`}
                  >
                    <div
                      className="flex min-w-0 items-center gap-3"
                      style={{
                        paddingLeft: `${node.depth * 24}px`,
                      }}
                    >
                      {node.depth > 0 && (
                        <span className="-ml-3 font-mono text-xs text-faint">
                          └
                        </span>
                      )}

                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border font-mono text-xs ${
                          node.event.status === "error"
                            ? "border-failure/30 text-failure"
                            : "border-line text-ink-2 group-hover:text-ink"
                        }`}
                      >
                        {getEventIcon(node.event.type)}
                      </span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm text-ink group-hover:text-ink">
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
                              className="shrink-0 rounded bg-warning-soft px-1.5 py-0.5 text-xs text-warning"
                            >
                              missing parent
                            </span>
                          )}
                        </div>

                        <div className="mt-0.5 truncate text-xs text-faint">
                          {node.event.type}
                          {node.event.source ? ` • ${node.event.source}` : ""}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="relative h-2 flex-1 rounded-full bg-raised">
                        <div
                          className={`absolute top-0 h-2 rounded-full ${
                            node.event.status === "error"
                              ? "bg-failure"
                              : "bg-accent/70"
                          }`}
                          style={{
                            left: `${left}%`,
                            width: `${Math.min(width, 100 - left)}%`,
                            minWidth: "4px",
                          }}
                        />
                      </div>

                      <span className="w-28 shrink-0 text-right font-mono text-xs text-faint">
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
      </>
  );
}
