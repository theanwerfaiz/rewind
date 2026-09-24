import Link from "next/link";
import { notFound } from "next/navigation";

import type { RewindHttpMetadata } from "@/lib/event-metadata";

import { ReplayPanel } from "@/components/events/ReplayPanel";
import { TestGenerator } from "@/components/events/TestGenerator";
import { getEventById } from "@/lib/events";
import { getReplaysForEvent } from "@/lib/replays";

function formatDate(timestamp: string) {
  return new Date(timestamp).toLocaleString();
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-slate-300">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function replayStatusClass(status: number) {
  if (status >= 200 && status < 300) {
    return "bg-emerald-500/10 text-emerald-400";
  }

  if (status >= 400) {
    return "bg-red-500/10 text-red-400";
  }

  return "bg-white/10 text-slate-400";
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

  const isHttpEvent = event.type === "http.request";

  const method = metadata?.method ?? null;

  const path = metadata?.path ?? null;

  const requestHeaders = metadata?.headers ?? null;

  const response = metadata?.response ?? null;

  return (
    <main className="min-h-screen bg-[#08090b] text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-slate-400 transition hover:text-white"
          >
            ← Back to events
          </Link>
        </div>

        {/* Event Header */}
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-wider text-slate-400">
                {event.type}
              </span>

              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  event.status === "success"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : event.status === "error"
                      ? "bg-red-500/10 text-red-400"
                      : "bg-white/10 text-slate-400"
                }`}
              >
                {event.status}
              </span>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight">
              {event.title}
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              {formatDate(event.timestamp)}
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
            <div className="text-xs uppercase tracking-wider text-slate-500">
              Event ID
            </div>

            <div className="mt-2 max-w-xs break-all font-mono text-sm text-slate-300">
              {event.id}
            </div>
          </div>
        </div>

        {/* Overview + Context */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
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

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <h2 className="mb-5 text-lg font-medium">Request Context</h2>

            <div className="space-y-4">
              <InfoRow label="Request ID" value={event.requestId ?? "—"} />

              <InfoRow label="Trace ID" value={event.traceId ?? "—"} />

              <InfoRow label="Span ID" value={event.spanId ?? "—"} />

              <InfoRow label="Session ID" value={event.sessionId ?? "—"} />

              <InfoRow label="User ID" value={event.userId ?? "—"} />

              <InfoRow label="Execution ID" value={event.executionId ?? "—"} />

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
        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium">Request</h2>

              <p className="mt-1 text-sm text-slate-500">
                What Rewind captured from the incoming request.
              </p>
            </div>

            {isHttpEvent && method && path ? (
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm text-slate-300">
                <span className="text-white">{method}</span> {path}
              </div>
            ) : null}
          </div>

          {isHttpEvent ? (
            <div className="space-y-6">
              <div>
                <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">
                  Headers
                </div>

                {requestHeaders ? (
                  <JsonBlock value={requestHeaders} />
                ) : (
                  <p className="text-sm text-slate-500">
                    No request headers captured.
                  </p>
                )}
              </div>

              <div>
                <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">
                  Payload
                </div>

                {payload !== undefined && payload !== null ? (
                  <JsonBlock value={payload} />
                ) : (
                  <p className="text-sm text-slate-500">
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
                <p className="text-sm text-slate-500">
                  No request payload captured.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Response */}
        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="mb-5">
            <h2 className="text-lg font-medium">Response</h2>

            <p className="mt-1 text-sm text-slate-500">
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
                <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">
                  Headers
                </div>

                {response.headers ? (
                  <JsonBlock value={response.headers} />
                ) : (
                  <p className="text-sm text-slate-500">
                    No response headers captured.
                  </p>
                )}
              </div>

              <div>
                <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">
                  Body
                </div>

                {hasResponseBody(response) ? (
                  <JsonBlock value={response.body} />
                ) : (
                  <p className="text-sm text-slate-500">
                    No response body captured.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-white/5 bg-black/20 p-5">
              <p className="text-sm text-slate-500">No response captured.</p>
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
        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium">Replay History</h2>

              <p className="mt-1 text-sm text-slate-500">
                Every replay attempt made from this event.
              </p>
            </div>

            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-slate-400">
              {replays.length} {replays.length === 1 ? "replay" : "replays"}
            </span>
          </div>

          {replays.length === 0 ? (
            <div className="rounded-xl border border-white/5 bg-black/20 p-5">
              <p className="text-sm text-slate-500">No replay attempts yet.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/5">
              <div className="divide-y divide-white/5">
                {replays.map((replay) => (
                  <Link
                    key={replay.id}
                    href={`/replays/${replay.id}`}
                    className="flex flex-col gap-4 px-5 py-4 transition hover:bg-white/[0.03] md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 font-mono text-xs text-slate-300">
                          {replay.method}
                        </span>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${replayStatusClass(
                            replay.status,
                          )}`}
                        >
                          {replay.status}
                        </span>

                        <span className="font-mono text-xs text-slate-500">
                          {replay.duration}
                        </span>
                      </div>

                      <div className="mt-2 truncate font-mono text-sm text-slate-300">
                        {replay.url}
                      </div>

                      <div className="mt-1 text-xs text-slate-600">
                        {formatDate(replay.timestamp)}
                      </div>
                    </div>

                    <div className="shrink-0 text-sm text-slate-500">
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

        {/* Raw Metadata */}
        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <details>
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-medium">Raw Metadata</h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Full captured metadata for advanced debugging.
                  </p>
                </div>

                <span className="text-sm text-slate-500">Expand</span>
              </div>
            </summary>

            <div className="mt-5">
              {metadata ? (
                <JsonBlock value={metadata} />
              ) : (
                <p className="text-sm text-slate-500">No metadata captured.</p>
              )}
            </div>
          </details>
        </section>
      </div>
    </main>
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
    <div className="flex flex-col gap-1 border-b border-white/5 pb-3 last:border-0 last:pb-0">
      <span className="text-xs uppercase tracking-wider text-slate-500">
        {label}
      </span>

      {href ? (
        <Link
          href={href}
          className="break-all font-mono text-sm text-slate-300 transition hover:text-white"
        >
          {value}
        </Link>
      ) : (
        <span className="break-all font-mono text-sm text-slate-300">
          {value}
        </span>
      )}
    </div>
  );
}
