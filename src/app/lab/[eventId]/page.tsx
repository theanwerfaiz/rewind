import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ExperimentBuilder } from "@/components/lab/ExperimentBuilder";
import type { RewindHttpMetadata } from "@/lib/event-metadata";
import { getEventById, getEventsByExecutionId } from "@/lib/events";
import { describeMutation } from "@/lib/mutations";
import { getReplaysForEvent } from "@/lib/replays";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/StatusBadge";
import { ButtonLink } from "@/components/ui/primitives";
import { formatDateTime, shortId } from "@/lib/format";
import type { Metadata } from "next";

const REPLAYABLE_TYPES = new Set(["http.request", "webhook.received"]);

function statusClass(status: number | undefined) {
  if (status === undefined) {
    return "bg-hover text-ink-2";
  }

  return status < 400
    ? "bg-success-soft text-success"
    : "bg-failure-soft text-failure";
}

function Block({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div className="mb-1.5 text-xs uppercase tracking-wider text-faint">
        {label}
      </div>

      <pre className="max-h-64 overflow-auto rounded-xl border border-line bg-canvas p-3 text-xs leading-5 text-ink-2">
        {value === undefined || value === null
          ? "—"
          : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventId: string }>;
}): Promise<Metadata> {
  const { eventId } = await params;

  const event = getEventById(eventId);

  return {
    title: event ? `Replay Lab · ${event.title}` : "Replay Lab",
  };
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
    <>
      <PageHeader
        crumbs={[
          ...(event.executionId
            ? [
                { label: "Executions", href: "/executions" },
                {
                  label: shortId(event.executionId),
                  href: `/executions/${event.executionId}`,
                },
              ]
            : [{ label: "Events", href: "/events" }]),
          { label: "Replay Lab" },
        ]}
        badges={<Badge tone="accent">replay lab</Badge>}
        title={event.title}
        description="Branch this captured request into experiments. The original stays exactly as captured; every experiment is stored with its mutations and the execution it produced."
        actions={
          <ButtonLink href={`/events/${event.id}`} variant="ghost">
            Original event
          </ButtonLink>
        }
      />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <section className="min-w-0 rounded-2xl border border-line bg-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-2">
                Original
              </div>

              <span className="rounded bg-raised px-2 py-0.5 text-xs uppercase tracking-wider text-muted">
                immutable
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-ink">
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
                <div className="mb-1.5 text-xs uppercase tracking-wider text-faint">
                  Recorded dependencies
                </div>

                {dependencyEvents.length === 0 ? (
                  <p className="text-xs text-faint">
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
                          className="flex items-center gap-2 font-mono text-xs text-ink-2"
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
            defaultDependencyMode={getSettings().defaultDependencyMode}
            original={{
              method: metadata?.method ?? "POST",
              path: metadata?.path ?? "/",
              headers: metadata?.headers ?? {},
              payload: event.payload,
            }}
          />
        </div>

        <section className="mt-8 overflow-hidden rounded-2xl border border-line bg-panel">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-sm font-medium text-ink">Experiments</h2>

            <p className="mt-0.5 text-xs text-faint">
              Every replay of this request, newest first.
            </p>
          </div>

          {experiments.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-faint">
              No experiments yet.
            </p>
          ) : (
            experiments.map((experiment) => (
              <div
                key={experiment.id}
                className="flex flex-col gap-3 border-b border-line px-5 py-4 last:border-0 md:flex-row md:items-center"
              >
                <span
                  className={`w-12 shrink-0 rounded px-2 py-0.5 text-center font-mono text-xs ${statusClass(
                    experiment.status,
                  )}`}
                >
                  {experiment.status}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">
                    {experiment.label ??
                      (experiment.mutations.length === 0
                        ? "Plain replay"
                        : "Unlabelled experiment")}
                  </div>

                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {experiment.mutations.length === 0 ? (
                      <span className="text-xs text-faint">
                        no mutations
                      </span>
                    ) : (
                      experiment.mutations.map((mutation, index) => (
                        <code
                          key={index}
                          className="rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent"
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
                      className={`rounded px-1.5 py-0.5 text-xs uppercase tracking-wider ${
                        experiment.dependencyMode === "live"
                          ? "bg-warning-soft text-warning"
                          : "bg-raised text-muted"
                      }`}
                    >
                      deps {experiment.dependencyMode}
                    </span>
                  )}

                  <span className="font-mono text-faint">
                    {experiment.duration}
                  </span>

                  <span className="text-faint">
                    {formatDateTime(experiment.createdAt)}
                  </span>

                  {experiment.resultExecutionId && (
                    <Link
                      href={`/executions/${experiment.resultExecutionId}`}
                      className="text-accent hover:text-accent"
                    >
                      Execution
                    </Link>
                  )}

                  {experiment.resultExecutionId &&
                    experiment.sourceExecutionId && (
                      <Link
                        href={`/executions/compare?original=${experiment.sourceExecutionId}&candidate=${experiment.resultExecutionId}`}
                        className="text-accent hover:text-accent"
                      >
                        Diff
                      </Link>
                    )}

                  <Link
                    href={`/replays/${experiment.id}`}
                    className="text-ink-2 hover:text-ink"
                  >
                    Compare
                  </Link>
                </div>
              </div>
            ))
          )}
        </section>
      </>
  );
}
