import { ChevronRight, FlaskConical, Package } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ExecutionGraph, type GraphRow } from "@/components/executions/ExecutionGraph";
import { InvestigationPanel } from "@/components/executions/InvestigationPanel";
import {
  InvariantPanel,
  type InvariantSuggestion,
} from "@/components/executions/InvariantPanel";
import { IdChip } from "@/components/ui/IdChip";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink, Panel } from "@/components/ui/primitives";
import { Badge, HttpStatus, StatusBadge } from "@/components/ui/StatusBadge";
import { WorkspaceTabs, type WorkspaceTab } from "@/components/ui/WorkspaceTabs";
import { parseDurationMs } from "@/lib/events";
import { getExecutionGraphById } from "@/lib/executions";
import { formatDateTime, formatMs, formatRelative, shortId } from "@/lib/format";
import { getInvariantsForExecution } from "@/lib/invariant-store";
import { buildInvestigation } from "@/lib/investigation";
import {
  describeInvariant,
  evaluateInvariants,
  type InvariantDefinition,
} from "@/lib/invariants";
import { describeMutation } from "@/lib/mutations";
import { getReplayByResultExecutionId, getReplaysForEvent } from "@/lib/replays";

export default async function ExecutionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
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

  const nodesById = new Map(graph.nodes.map((node) => [node.event.id, node]));

  const parentOf = new Map<string, string>();

  for (const node of graph.nodes) {
    for (const childId of node.childIds) {
      parentOf.set(childId, node.event.id);
    }
  }

  const rows: GraphRow[] = graph.nodes.map((node) => ({
    id: node.event.id,
    title: node.event.title,
    type: node.event.type,
    status: node.event.status,
    source: node.event.source ?? null,
    timestamp: node.event.timestamp,
    depth: node.depth,
    childIds: node.childIds,
    parentId: parentOf.get(node.event.id) ?? null,
    orphan: node.orphan,
    offsetMs: Math.max(Date.parse(node.event.timestamp) - startedAt, 0),
    durationMs: parseDurationMs(node.event.duration) ?? 0,
    payload: node.event.payload,
    metadata: node.event.metadata ?? null,
  }));

  const firstFailure = graph.firstFailureId
    ? nodesById.get(graph.firstFailureId)
    : undefined;

  const firstFailureOffset = firstFailure
    ? Math.max(Date.parse(firstFailure.event.timestamp) - startedAt, 0)
    : 0;

  // Experiments branch from the root request; a replay shows its siblings.
  const experimentsEventId = replay?.eventId ?? execution.rootEventId;

  const experiments =
    experimentsEventId &&
    (execution.rootType === "http.request" ||
      execution.rootType === "webhook.received" ||
      replay)
      ? getReplaysForEvent(experimentsEventId)
      : [];

  const originalExecutionId = replay?.sourceExecutionId ?? execution.id;

  const failingInvariants = invariantResults.filter((item) => !item.passed).length;

  const { tab } = await searchParams;

  const tabs: WorkspaceTab[] = [
    {
      value: "graph",
      label: "Graph",
      count: execution.eventCount,
      content: (
        <ExecutionGraph
          rows={rows}
          totalMs={totalMs}
          failurePath={graph.failurePath}
          initialSelectedId={graph.firstFailureId ?? graph.rootIds[0] ?? null}
        />
      ),
    },
  ];

  if (investigation) {
    tabs.push({
      value: "investigation",
      label: "Investigation",
      content: <InvestigationPanel investigation={investigation} />,
    });
  }

  tabs.push({
    value: "invariants",
    label: "Invariants",
    count: invariants.length,
    tone:
      invariants.length === 0
        ? undefined
        : failingInvariants > 0
          ? "failure"
          : "success",
    content: (
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
    ),
  });

  if (experimentsEventId && (experiments.length > 0 || execution.rootType === "http.request" || execution.rootType === "webhook.received")) {
    tabs.push({
      value: "experiments",
      label: "Experiments",
      count: experiments.length,
      content: (
        <Panel
          title="Experiments"
          description="Replays of this request, newest first"
          actions={
            <ButtonLink href={`/lab/${experimentsEventId}`} variant="primary">
              <FlaskConical size={14} />
              New experiment
            </ButtonLink>
          }
          flush
        >
          {experiments.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted">
              No experiments yet. Open the Replay Lab to replay this request
              with changes and see how the application behaves.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {experiments.map((experiment) => (
                <li
                  key={experiment.id}
                  className={`flex flex-wrap items-center gap-3 px-4 py-3 text-sm ${
                    experiment.resultExecutionId === execution.id ? "bg-accent-soft" : ""
                  }`}
                >
                  <HttpStatus status={experiment.status} />

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-ink">
                      {experiment.label ?? "Plain replay"}
                    </div>

                    <div className="mt-0.5 truncate font-mono text-xs text-muted">
                      {experiment.mutations.length === 0
                        ? "no mutations"
                        : experiment.mutations.map(describeMutation).join(" · ")}
                    </div>
                  </div>

                  {experiment.dependencyMode && (
                    <Badge tone="neutral">deps {experiment.dependencyMode}</Badge>
                  )}

                  <span className="font-mono text-xs tabular-nums text-muted">
                    {experiment.duration} · {formatRelative(experiment.createdAt)}
                  </span>

                  <div className="flex gap-3 text-xs">
                    {experiment.resultExecutionId &&
                      experiment.resultExecutionId !== execution.id && (
                        <Link
                          href={`/executions/${experiment.resultExecutionId}`}
                          className="text-accent hover:brightness-125"
                        >
                          Execution
                        </Link>
                      )}

                    {experiment.resultExecutionId && (
                      <Link
                        href={`/executions/compare?original=${originalExecutionId}&candidate=${experiment.resultExecutionId}`}
                        className="text-accent hover:brightness-125"
                      >
                        Diff
                      </Link>
                    )}

                    <Link
                      href={`/replays/${experiment.id}`}
                      className="text-ink-2 hover:text-ink"
                    >
                      Details
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ),
    });
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
        meta={
          <>
            <IdChip id={execution.id} full />
            <span className="font-mono tabular-nums">{formatMs(totalMs)}</span>
            <span>{execution.eventCount} events</span>
            {execution.environment && <span>{execution.environment}</span>}
            {execution.traceId && (
              <span className="font-mono" title="Trace ID">
                trace {shortId(execution.traceId, 12)}
              </span>
            )}
            <span>{formatDateTime(execution.startedAt)}</span>
          </>
        }
        actions={
          <>
            {execution.rootEventId && (
              <ButtonLink href={`/events/${execution.rootEventId}`} variant="ghost">
                Root event
              </ButtonLink>
            )}

            <ButtonLink href={`/executions/${execution.id}/capsule`}>
              <Package size={14} />
              Capsule
            </ButtonLink>

            {execution.rootEventId &&
              (execution.rootType === "http.request" ||
                execution.rootType === "webhook.received") && (
                <ButtonLink href={`/lab/${execution.rootEventId}`} variant="primary">
                  <FlaskConical size={14} />
                  Replay Lab
                </ButtonLink>
              )}
          </>
        }
      />

      {execution.capsuleId && (
        <div className="mb-4 rounded-xl border border-accent/20 bg-accent-soft px-4 py-3 text-sm text-accent">
          Imported from capsule{" "}
          <span className="font-mono text-xs">{execution.capsuleId}</span>
        </div>
      )}

      {replay && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent/20 bg-accent-soft px-4 py-3 text-sm">
          <span className="text-accent">
            Replay{replay.label ? `: ${replay.label}` : ""}
          </span>

          {replay.sourceExecutionId && (
            <Link
              href={`/executions/compare?original=${replay.sourceExecutionId}&candidate=${execution.id}`}
              className="text-accent hover:brightness-125"
            >
              Diff with original →
            </Link>
          )}

          <Link href={`/lab/${replay.eventId}`} className="text-ink-2 hover:text-ink">
            Replay Lab
          </Link>
        </div>
      )}

      {firstFailure && (
        <section className="mb-6 rounded-xl border border-failure/25 bg-failure-soft p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-wider text-failure">
                Failure started +{formatMs(firstFailureOffset)} in
              </div>

              <h2 className="mt-1 text-base font-medium text-ink">
                {firstFailure.event.title}
              </h2>
            </div>

            {execution.fingerprintId && (
              <Link
                href={`/fingerprints/${execution.fingerprintId}`}
                className="rounded-lg border border-failure/30 px-2.5 py-1 font-mono text-xs text-failure transition hover:border-failure/60"
              >
                {shortId(execution.fingerprintId)} · all occurrences →
              </Link>
            )}
          </div>

          <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
            {graph.failurePath.map((eventId, index) => {
              const node = nodesById.get(eventId);

              if (!node) {
                return null;
              }

              return (
                <li key={eventId} className="flex items-center gap-1.5">
                  {index > 0 && <ChevronRight size={12} className="text-failure" />}

                  <Link
                    href={`/events/${eventId}`}
                    className="rounded-md border border-failure/20 bg-canvas px-2 py-1 text-ink-2 transition hover:border-failure/50 hover:text-ink"
                  >
                    {node.event.title}
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <WorkspaceTabs tabs={tabs} initial={tab} />
    </>
  );
}
