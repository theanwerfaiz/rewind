import Link from "next/link";
import { notFound } from "next/navigation";

import { ReplayComparison } from "@/components/events/ReplayComparison";
import { ReplayResponseComparison } from "@/components/events/ReplayResponseComparison";
import { getEventById } from "@/lib/events";
import { getReplayById } from "@/lib/replays";

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

function statusClass(status: number) {
  if (status >= 200 && status < 300) {
    return "bg-emerald-500/10 text-emerald-400";
  }

  if (status >= 400) {
    return "bg-red-500/10 text-red-400";
  }

  return "bg-white/10 text-slate-400";
}

function getOriginalResponseStatus(metadata: unknown) {
  if (typeof metadata !== "object" || metadata === null) {
    return undefined;
  }

  const value = metadata as {
    response?: {
      status?: unknown;
    };
  };

  return typeof value.response?.status === "number"
    ? value.response.status
    : undefined;
}

function getOriginalResponseBody(metadata: unknown) {
  if (typeof metadata !== "object" || metadata === null) {
    return undefined;
  }

  const value = metadata as {
    response?: {
      body?: unknown;
    };
  };

  return value.response?.body;
}

function getOriginalResponseHeaders(metadata: unknown) {
  if (typeof metadata !== "object" || metadata === null) {
    return undefined;
  }

  const value = metadata as {
    response?: {
      headers?: unknown;
    };
  };

  return value.response?.headers;
}

export default async function ReplayDetailsPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } = await params;

  const replay = getReplayById(id);

  if (!replay) {
    notFound();
  }

  const event = getEventById(replay.eventId);

  if (!event) {
    notFound();
  }

  const originalStatus = getOriginalResponseStatus(event.metadata);

  const originalBody = getOriginalResponseBody(event.metadata);

  const originalHeaders = getOriginalResponseHeaders(event.metadata);

  const statusMatches =
    originalStatus === undefined || originalStatus === replay.status;

  const bodyMatches =
    JSON.stringify(originalBody) === JSON.stringify(replay.responseBody);

  const replayMatches = statusMatches && bodyMatches;

  return (
    <main className="min-h-screen bg-[#08090b] text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8">
          <Link
            href={`/events/${replay.eventId}`}
            className="text-sm text-slate-400 transition hover:text-white"
          >
            ← Back to event
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="rounded-md border border-white/10 bg-black/20 px-3 py-1 font-mono text-sm text-slate-300">
              {replay.method}
            </span>

            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass(
                replay.status,
              )}`}
            >
              {replay.status}
            </span>
          </div>

          <h1 className="break-all text-3xl font-semibold tracking-tight">
            Replay
          </h1>

          <p className="mt-2 break-all font-mono text-sm text-slate-500">
            {replay.url}
          </p>

          <p className="mt-2 text-sm text-slate-600">
            {formatDate(replay.timestamp)}
          </p>
        </div>

        {/* Replay Result */}
        <section
          className={`rounded-2xl border p-6 ${
            replayMatches
              ? "border-emerald-500/20 bg-emerald-500/[0.04]"
              : "border-amber-500/20 bg-amber-500/[0.04]"
          }`}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg ${
                  replayMatches
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-amber-500/10 text-amber-400"
                }`}
              >
                {replayMatches ? "✓" : "≠"}
              </div>

              <div>
                <div
                  className={`text-sm font-semibold uppercase tracking-wider ${
                    replayMatches ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {replayMatches ? "Replay matches" : "Replay differs"}
                </div>

                <p className="mt-1 text-sm text-slate-400">
                  {replayMatches
                    ? "The replay returned the same status and response body as the original event."
                    : "The replay produced a different status or response body."}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:min-w-64">
              <ResultMetric
                label="Original"
                value={
                  originalStatus !== undefined ? String(originalStatus) : "—"
                }
              />

              <ResultMetric label="Replay" value={String(replay.status)} />
            </div>
          </div>
        </section>

        {/* Replay Information */}
        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="mb-5 text-lg font-medium">Replay Information</h2>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Method" value={replay.method} />

            <Info label="Status" value={String(replay.status)} />

            <Info label="Duration" value={replay.duration} />

            <Info label="Replay ID" value={replay.id} />
          </div>
        </section>

        {/* Original Event */}
        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-medium">Original Event</h2>

              <p className="mt-1 text-sm text-slate-500">
                The event from which this replay was created.
              </p>
            </div>

            <Link
              href={`/events/${event.id}`}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              View event →
            </Link>
          </div>

          <div className="mt-5 rounded-xl border border-white/5 bg-black/20 p-4">
            <div className="text-sm font-medium text-slate-300">
              {event.title}
            </div>

            <div className="mt-1 break-all font-mono text-xs text-slate-600">
              {event.id}
            </div>
          </div>
        </section>

        {/* Request Comparison */}
        <ReplayComparison
          originalPayload={event.payload}
          replayPayload={replay.payload}
        />

        {/* Response Comparison */}
        <ReplayResponseComparison
          originalStatus={originalStatus}
          originalBody={originalBody}
          replayStatus={replay.status}
          replayBody={replay.responseBody}
        />

        {/* Replay Request */}
        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="mb-5">
            <h2 className="text-lg font-medium">Replay Request</h2>

            <p className="mt-1 text-sm text-slate-500">
              The exact payload used for this replay attempt.
            </p>
          </div>

          {replay.payload !== null ? (
            <JsonBlock value={replay.payload} />
          ) : (
            <p className="text-sm text-slate-500">No request payload.</p>
          )}
        </section>

        {/* Replay Response */}
        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="mb-5">
            <h2 className="text-lg font-medium">Replay Response</h2>

            <p className="mt-1 text-sm text-slate-500">
              The response returned by the application.
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">
                Original Headers
              </div>

              {originalHeaders !== undefined ? (
                <JsonBlock value={originalHeaders} />
              ) : (
                <p className="text-sm text-slate-500">
                  No original response headers.
                </p>
              )}
            </div>

            <div>
              <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">
                Replay Headers
              </div>

              {replay.responseHeaders !== null ? (
                <JsonBlock value={replay.responseHeaders} />
              ) : (
                <p className="text-sm text-slate-500">
                  No replay response headers.
                </p>
              )}
            </div>

            <div>
              <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">
                Replay Body
              </div>

              {replay.responseBody !== null ? (
                <JsonBlock value={replay.responseBody} />
              ) : (
                <p className="text-sm text-slate-500">No response body.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-500">
        {label}
      </div>

      <div className="mt-2 break-all font-mono text-sm text-slate-300">
        {value}
      </div>
    </div>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-600">
        {label}
      </div>

      <div className="mt-1 font-mono text-sm text-slate-300">{value}</div>
    </div>
  );
}
