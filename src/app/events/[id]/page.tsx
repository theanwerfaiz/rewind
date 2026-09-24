import Link from "next/link";
import { notFound } from "next/navigation";

import type { RewindHttpMetadata } from "@/lib/event-metadata";

import { ReplayPanel } from "@/components/events/ReplayPanel";
import { TestGenerator } from "@/components/events/TestGenerator";
import { getEventById } from "@/lib/events";
import { getReplaysForEvent } from "@/lib/replays";
import { getTestRunsForEvent } from "@/lib/test-runs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, StatusBadge } from "@/components/ui/StatusBadge";
import { IdChip } from "@/components/ui/IdChip";
import { ButtonLink } from "@/components/ui/primitives";
import { shortId } from "@/lib/format";
import type { Metadata } from "next";

function formatDate(timestamp: string) {
  return new Date(timestamp).toLocaleString();
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-line bg-canvas p-4 text-sm leading-6 text-ink-2">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function replayStatusClass(status: number) {
  if (status >= 200 && status < 300) {
    return "bg-success-soft text-success";
  }

  if (status >= 400) {
    return "bg-failure-soft text-failure";
  }

  return "bg-hover text-ink-2";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const event = getEventById(id);

  return {
    title: event ? event.title : "Event not found",
  };
}

export default async function EventDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const event = getEventById(id);

  if (!event) {
    notFound();
  }

  const metadata = event.metadata as RewindHttpMetadata | undefined;

  const payload = event.payload;

  const replays = getReplaysForEvent(event.id);

  const testRuns = getTestRunsForEvent(event.id);

  const isHttpEvent = event.type === "http.request";

  const method = metadata?.method ?? null;

  const path = metadata?.path ?? null;

  const requestHeaders = metadata?.headers ?? null;

  const response = metadata?.response ?? null;

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
          { label: "Event" },
        ]}
        badges={
          <>
            <Badge>{event.type}</Badge>
            <StatusBadge status={event.status} />
          </>
        }
        title={event.title}
        meta={
          <>
            <span className="font-mono tabular-nums">
              {formatDate(event.timestamp)}
            </span>
            <IdChip id={event.id} full />
          </>
        }
        actions={
          (isHttpEvent || event.type === "webhook.received") && (
            <ButtonLink href={`/lab/${event.id}`} variant="primary">
              Open in Replay Lab
            </ButtonLink>
          )
        }
      />

        {/* Overview + Context */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-line bg-panel p-6">
            <h2 className="mb-5 text-lg font-medium">Overview</h2>

            <div className="space-y-4">
              <InfoRow label="Type" value={event.type} />

              <InfoRow label="Status" value={event.status} />

              <InfoRow label="Duration" value={event.duration ?? "—"} />

              <InfoRow label="Source" value={event.source ?? "—"} />

              <InfoRow
                label="Created"
                value={event.createdAt ? formatDate(event.createdAt) : "—"}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-panel p-6">
            <h2 className="mb-5 text-lg font-medium">Request Context</h2>

            <div className="space-y-4">
              <InfoRow label="Request ID" value={event.requestId ?? "—"} />

              <InfoRow label="Trace ID" value={event.traceId ?? "—"} />

              <InfoRow label="Span ID" value={event.spanId ?? "—"} />

              <InfoRow label="Session ID" value={event.sessionId ?? "—"} />

              <InfoRow label="User ID" value={event.userId ?? "—"} />

              <InfoRow
                label="Execution ID"
                value={event.executionId ?? "—"}
                href={
                  event.executionId
                    ? `/executions/${event.executionId}`
                    : undefined
                }
              />

              <InfoRow
                label="Parent Event"
                value={
                  event.parentEventId ??
                  (event.executionId ? "— (execution root)" : "—")
                }
                href={
                  event.parentEventId
                    ? `/events/${event.parentEventId}`
                    : undefined
                }
              />
            </div>
          </section>
        </div>

        {/* Request */}
        <section className="mt-6 rounded-2xl border border-line bg-panel p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium">Request</h2>

              <p className="mt-1 text-sm text-muted">
                What Rewind captured from the incoming request.
              </p>
            </div>

            {isHttpEvent && method && path ? (
              <div className="rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-sm text-ink-2">
                <span className="text-ink">{method}</span> {path}
              </div>
            ) : null}
          </div>

          {isHttpEvent ? (
            <div className="space-y-6">
              <div>
                <div className="mb-2 text-xs uppercase tracking-wider text-muted">
                  Headers
                </div>

                {requestHeaders ? (
                  <JsonBlock value={requestHeaders} />
                ) : (
                  <p className="text-sm text-muted">
                    No request headers captured.
                  </p>
                )}
              </div>

              <div>
                <div className="mb-2 text-xs uppercase tracking-wider text-muted">
                  Payload
                </div>

                {payload !== undefined && payload !== null ? (
                  <JsonBlock value={payload} />
                ) : (
                  <p className="text-sm text-muted">
                    No request payload captured.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div>
              {payload !== undefined && payload !== null ? (
                <JsonBlock value={payload} />
              ) : (
                <p className="text-sm text-muted">
                  No request payload captured.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Response */}
        <section className="mt-6 rounded-2xl border border-line bg-panel p-6">
          <div className="mb-5">
            <h2 className="text-lg font-medium">Response</h2>

            <p className="mt-1 text-sm text-muted">
              What the application returned.
            </p>
          </div>

          {response ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoRow label="Status" value={String(response.status)} />

                <InfoRow
                  label="Status Text"
                  value={response.statusText ? response.statusText : "—"}
                />
              </div>

              <div>
                <div className="mb-2 text-xs uppercase tracking-wider text-muted">
                  Headers
                </div>

                {response.headers ? (
                  <JsonBlock value={response.headers} />
                ) : (
                  <p className="text-sm text-muted">
                    No response headers captured.
                  </p>
                )}
              </div>

              <div>
                <div className="mb-2 text-xs uppercase tracking-wider text-muted">
                  Body
                </div>

                {hasResponseBody(response) ? (
                  <JsonBlock value={response.body} />
                ) : (
                  <p className="text-sm text-muted">
                    No response body captured.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-canvas p-5">
              <p className="text-sm text-muted">No response captured.</p>
            </div>
          )}
        </section>

        {/* Replay */}
        <ReplayPanel
          eventId={event.id}
          eventType={event.type}
          payload={payload}
        />

        {/* Replay History */}
        <section className="mt-6 rounded-2xl border border-line bg-panel p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium">Replay History</h2>

              <p className="mt-1 text-sm text-muted">
                Every replay attempt made from this event.
              </p>
            </div>

            <span className="rounded-full border border-line bg-canvas px-3 py-1 text-xs text-ink-2">
              {replays.length} {replays.length === 1 ? "replay" : "replays"}
            </span>
          </div>

          {replays.length === 0 ? (
            <div className="rounded-xl border border-line bg-canvas p-5">
              <p className="text-sm text-muted">No replay attempts yet.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line">
              <div className="divide-y divide-white/5">
                {replays.map((replay) => (
                  <Link
                    key={replay.id}
                    href={`/replays/${replay.id}`}
                    className="flex flex-col gap-4 px-5 py-4 transition hover:bg-panel md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="rounded-md border border-line bg-canvas px-2 py-1 font-mono text-xs text-ink-2">
                          {replay.method}
                        </span>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${replayStatusClass(
                            replay.status,
                          )}`}
                        >
                          {replay.status}
                        </span>

                        <span className="font-mono text-xs text-muted">
                          {replay.duration}
                        </span>
                      </div>

                      <div className="mt-2 truncate font-mono text-sm text-ink-2">
                        {replay.url}
                      </div>

                      <div className="mt-1 text-xs text-faint">
                        {formatDate(replay.timestamp)}
                      </div>
                    </div>

                    <div className="shrink-0 text-sm text-muted">
                      View →
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Test Generation */}
        <TestGenerator eventId={event.id} eventType={event.type} />

        {testRuns.length > 0 && (
          <section className="mt-6 rounded-2xl border border-line bg-panel p-6">
            <h2 className="text-lg font-medium">Regression test runs</h2>

            <p className="mt-1 text-sm text-muted">
              Generated tests run against this event, newest first.
            </p>

            <ul className="mt-4 space-y-1.5">
              {testRuns.map((run) => (
                <li
                  key={run.id}
                  className="flex items-center gap-3 rounded-lg bg-canvas px-3 py-2 text-sm"
                >
                  <span
                    className={`w-12 shrink-0 font-mono text-xs ${
                      run.success ? "text-success" : "text-failure"
                    }`}
                  >
                    {run.success ? "PASS" : "FAIL"}
                  </span>

                  <span className="text-ink-2">{run.framework}</span>

                  <span className="font-mono text-xs text-faint">
                    {run.duration}
                  </span>

                  <span className="ml-auto text-xs text-faint">
                    {formatDate(run.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Raw Metadata */}
        <section className="mt-6 rounded-2xl border border-line bg-panel p-6">
          <details>
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-medium">Raw Metadata</h2>

                  <p className="mt-1 text-sm text-muted">
                    Full captured metadata for advanced debugging.
                  </p>
                </div>

                <span className="text-sm text-muted">Expand</span>
              </div>
            </summary>

            <div className="mt-5">
              {metadata ? (
                <JsonBlock value={metadata} />
              ) : (
                <p className="text-sm text-muted">No metadata captured.</p>
              )}
            </div>
          </details>
        </section>
      </>
  );
}

function hasResponseBody(response: RewindHttpMetadata["response"]) {
  return response?.body !== undefined;
}

function InfoRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-line pb-3 last:border-0 last:pb-0">
      <span className="text-xs uppercase tracking-wider text-muted">
        {label}
      </span>

      {href ? (
        <Link
          href={href}
          className="break-all font-mono text-sm text-ink-2 transition hover:text-ink"
        >
          {value}
        </Link>
      ) : (
        <span className="break-all font-mono text-sm text-ink-2">
          {value}
        </span>
      )}
    </div>
  );
}
