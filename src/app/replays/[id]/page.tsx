import Link from "next/link";
import { notFound } from "next/navigation";

import { ReplayComparison } from "@/components/events/ReplayComparison";
import { ReplayResponseComparison } from "@/components/events/ReplayResponseComparison";
import { getEventById } from "@/lib/events";
import { getReplayById } from "@/lib/replays";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, HttpStatus } from "@/components/ui/StatusBadge";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const replay = getReplayById(id);

  return {
    title: replay ? `Replay · ${replay.label ?? `${replay.method} ${replay.url}`}` : "Replay not found",
  };
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
    <>
      <PageHeader
        crumbs={[
          { label: "Replays", href: "/replays" },
          { label: shortId(replay.id) },
        ]}
        badges={
          <>
            <Badge>{replay.method}</Badge>
            <HttpStatus status={replay.status} />
          </>
        }
        title={replay.label ?? "Replay"}
        meta={
          <>
            <span className="break-all font-mono">{replay.url}</span>
            <span className="font-mono tabular-nums">
              {formatDate(replay.timestamp)}
            </span>
          </>
        }
        actions={
          <ButtonLink href={`/events/${replay.eventId}`} variant="ghost">
            Original event
          </ButtonLink>
        }
      />

        {/* Replay Result */}
        <section
          className={`rounded-2xl border p-6 ${
            replayMatches
              ? "border-success/20 bg-success-soft"
              : "border-warning/20 bg-warning-soft"
          }`}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg ${
                  replayMatches
                    ? "bg-success-soft text-success"
                    : "bg-warning-soft text-warning"
                }`}
              >
                {replayMatches ? "✓" : "≠"}
              </div>

              <div>
                <div
                  className={`text-sm font-semibold uppercase tracking-wider ${
                    replayMatches ? "text-success" : "text-warning"
                  }`}
                >
                  {replayMatches ? "Replay matches" : "Replay differs"}
                </div>

                <p className="mt-1 text-sm text-ink-2">
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
        <section className="mt-6 rounded-2xl border border-line bg-panel p-6">
          <h2 className="mb-5 text-lg font-medium">Replay Information</h2>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Method" value={replay.method} />

            <Info label="Status" value={String(replay.status)} />

            <Info label="Duration" value={replay.duration} />

            <Info label="Replay ID" value={replay.id} />
          </div>
        </section>

        {/* Original Event */}
        <section className="mt-6 rounded-2xl border border-line bg-panel p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-medium">Original Event</h2>

              <p className="mt-1 text-sm text-muted">
                The event from which this replay was created.
              </p>
            </div>

            <Link
              href={`/events/${event.id}`}
              className="rounded-lg border border-line bg-raised px-4 py-2 text-sm text-ink-2 transition hover:bg-hover hover:text-ink"
            >
              View event →
            </Link>
          </div>

          <div className="mt-5 rounded-xl border border-line bg-canvas p-4">
            <div className="text-sm font-medium text-ink-2">
              {event.title}
            </div>

            <div className="mt-1 break-all font-mono text-xs text-faint">
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
        <section className="mt-6 rounded-2xl border border-line bg-panel p-6">
          <div className="mb-5">
            <h2 className="text-lg font-medium">Replay Request</h2>

            <p className="mt-1 text-sm text-muted">
              The exact payload used for this replay attempt.
            </p>
          </div>

          {replay.payload !== null ? (
            <JsonBlock value={replay.payload} />
          ) : (
            <p className="text-sm text-muted">No request payload.</p>
          )}
        </section>

        {/* Replay Response */}
        <section className="mt-6 rounded-2xl border border-line bg-panel p-6">
          <div className="mb-5">
            <h2 className="text-lg font-medium">Replay Response</h2>

            <p className="mt-1 text-sm text-muted">
              The response returned by the application.
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <div className="mb-2 text-xs uppercase tracking-wider text-muted">
                Original Headers
              </div>

              {originalHeaders !== undefined ? (
                <JsonBlock value={originalHeaders} />
              ) : (
                <p className="text-sm text-muted">
                  No original response headers.
                </p>
              )}
            </div>

            <div>
              <div className="mb-2 text-xs uppercase tracking-wider text-muted">
                Replay Headers
              </div>

              {replay.responseHeaders !== null ? (
                <JsonBlock value={replay.responseHeaders} />
              ) : (
                <p className="text-sm text-muted">
                  No replay response headers.
                </p>
              )}
            </div>

            <div>
              <div className="mb-2 text-xs uppercase tracking-wider text-muted">
                Replay Body
              </div>

              {replay.responseBody !== null ? (
                <JsonBlock value={replay.responseBody} />
              ) : (
                <p className="text-sm text-muted">No response body.</p>
              )}
            </div>
          </div>
        </section>
      </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted">
        {label}
      </div>

      <div className="mt-2 break-all font-mono text-sm text-ink-2">
        {value}
      </div>
    </div>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-canvas px-4 py-3">
      <div className="text-xs uppercase tracking-wider text-faint">
        {label}
      </div>

      <div className="mt-1 font-mono text-sm text-ink-2">{value}</div>
    </div>
  );
}
