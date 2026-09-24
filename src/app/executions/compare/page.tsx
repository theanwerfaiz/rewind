import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { compareExecutions } from "@/lib/execution-compare";
import type {
  DiffOutcome,
  EventChange,
  EventChangeKind,
} from "@/lib/execution-diff";
import type { RewindEvent } from "@/lib/mock-events";

const OUTCOMES: Record<
  DiffOutcome,
  {
    title: string;
    detail: string;
    className: string;
  }
> = {
  fixed: {
    title: "Fixed",
    detail: "The original failed; this execution succeeded.",
    className: "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-200",
  },
  regressed: {
    title: "Regressed",
    detail: "The original succeeded; this execution failed.",
    className: "border-red-500/30 bg-red-500/[0.06] text-red-200",
  },
  still_failing: {
    title: "Still failing",
    detail: "Both executions failed the same way (same fingerprint).",
    className: "border-red-500/30 bg-red-500/[0.06] text-red-200",
  },
  different_failure: {
    title: "Different failure",
    detail: "Both executions failed, but not the same way.",
    className: "border-amber-500/30 bg-amber-500/[0.06] text-amber-200",
  },
  behavior_changed: {
    title: "Behaviour changed",
    detail: "Both executions succeeded, but took a different path.",
    className: "border-blue-500/30 bg-blue-500/[0.06] text-blue-200",
  },
  unchanged: {
    title: "Unchanged",
    detail: "Same events, statuses and responses.",
    className: "border-white/10 bg-white/[0.03] text-slate-200",
  },
};

const KIND_LABELS: Record<EventChangeKind, string> = {
  status: "status",
  http_status: "HTTP status",
  response: "response",
  payload: "request",
  timing: "timing",
};

function formatMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

function preview(value: unknown) {
  if (value === undefined) {
    return "—";
  }

  const text = JSON.stringify(value);

  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

function SideCard({
  label,
  side,
}: {
  label: string;
  side: {
    executionId: string;
    status: string;
    httpStatus: number | null;
    durationMs: number;
    eventCount: number;
    fingerprintId: string | null;
  };
}) {
  return (
    <Link
      href={`/executions/${side.executionId}`}
      className="block rounded-2xl border border-white/[0.07] bg-[#0d1320] p-5 transition hover:border-white/[0.15]"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          {label}
        </span>

        <span
          className={`rounded px-2 py-0.5 text-xs uppercase ${
            side.status === "error"
              ? "bg-red-500/10 text-red-300"
              : "bg-emerald-500/10 text-emerald-300"
          }`}
        >
          {side.status}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 font-mono text-sm text-slate-200">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-600">
            HTTP
          </div>
          {side.httpStatus ?? "—"}
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-600">
            Duration
          </div>
          {formatMs(side.durationMs)}
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-600">
            Events
          </div>
          {side.eventCount}
        </div>
      </div>

      <div className="mt-4 truncate font-mono text-[11px] text-slate-600">
        {side.executionId}
      </div>
    </Link>
  );
}

function EventList({
  title,
  events,
  tone,
}: {
  title: string;
  events: RewindEvent[];
  tone: "added" | "removed";
}) {
  if (events.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#0d1320] p-5">
      <h2 className="text-sm font-medium text-slate-200">
        {title}{" "}
        <span className="text-slate-600">({events.length})</span>
      </h2>

      <ul className="mt-3 space-y-1.5">
        {events.map((event) => (
          <li key={event.id}>
            <Link
              href={`/events/${event.id}`}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-white/[0.03]"
            >
              <span
                className={`font-mono ${
                  tone === "added" ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {tone === "added" ? "+" : "−"}
              </span>

              <span className="truncate text-slate-200">{event.title}</span>

              <span className="shrink-0 text-xs text-slate-600">
                {event.type}
              </span>

              {event.status === "error" && (
                <span className="shrink-0 rounded bg-red-500/10 px-1.5 text-[10px] text-red-300">
                  error
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChangedEvent({ change }: { change: EventChange }) {
  const fieldChanges = [...change.payloadChanges, ...change.responseChanges];

  return (
    <li className="rounded-xl border border-white/[0.06] bg-black/10 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/events/${change.candidate.id}`}
          className="text-sm text-slate-200 hover:text-white"
        >
          {change.candidate.title}
        </Link>

        {change.kinds.map((kind) => (
          <span
            key={kind}
            className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-blue-200"
          >
            {KIND_LABELS[kind]}
          </span>
        ))}
      </div>

      <dl className="mt-3 space-y-1 font-mono text-xs text-slate-400">
        {change.status && (
          <div>
            status: {change.status.from} → {change.status.to}
          </div>
        )}

        {change.httpStatus && (
          <div>
            HTTP: {change.httpStatus.from ?? "—"} →{" "}
            {change.httpStatus.to ?? "—"}
          </div>
        )}

        {change.durationMs && (
          <div>
            duration: {formatMs(change.durationMs.from)} →{" "}
            {formatMs(change.durationMs.to)}
          </div>
        )}

        {fieldChanges.slice(0, 12).map((field) => (
          <div key={field.path} className="truncate">
            {field.path}: {preview(field.original)} → {preview(field.replay)}
          </div>
        ))}

        {fieldChanges.length > 12 && (
          <div className="text-slate-600">
            +{fieldChanges.length - 12} more fields
          </div>
        )}
      </dl>
    </li>
  );
}

export default async function CompareExecutionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await connection();

  const { original, candidate } = await searchParams;

  if (typeof original !== "string" || typeof candidate !== "string") {
    notFound();
  }

  const diff = compareExecutions(original, candidate);

  if (!diff) {
    notFound();
  }

  const outcome = OUTCOMES[diff.outcome];

  return (
    <main className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 flex flex-wrap items-center gap-4 text-sm">
          <Link
            href={`/executions/${original}`}
            className="text-slate-500 transition hover:text-slate-200"
          >
            ← Original execution
          </Link>
        </div>

        <div className="mb-6">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs uppercase tracking-wider text-slate-400">
            Execution diff
          </span>
        </div>

        <section className={`mb-6 rounded-2xl border p-6 ${outcome.className}`}>
          <h1 className="text-3xl font-semibold tracking-tight">
            {outcome.title}
          </h1>

          <p className="mt-1 text-sm opacity-80">{outcome.detail}</p>

          {diff.firstDivergence && (
            <p className="mt-4 text-sm">
              Behaviour first diverges{" "}
              <span className="font-mono">
                +{formatMs(diff.firstDivergence.offsetMs)}
              </span>{" "}
              into the run:{" "}
              <Link
                href={`/events/${diff.firstDivergence.event.id}`}
                className="underline decoration-white/30 underline-offset-4 hover:decoration-white"
              >
                {diff.firstDivergence.kind} {diff.firstDivergence.event.title}
              </Link>
            </p>
          )}
        </section>

        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <SideCard label="Original" side={diff.original} />
          <SideCard label="Candidate" side={diff.candidate} />
        </div>

        {diff.summary.length > 0 && (
          <section className="mb-6 rounded-2xl border border-white/[0.07] bg-[#0d1320] p-5">
            <h2 className="text-sm font-medium text-slate-200">
              What changed
            </h2>

            <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
              {diff.summary.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="text-slate-600">•</span>
                  {line}
                </li>
              ))}
            </ul>

            <p className="mt-4 text-xs text-slate-600">
              {diff.unchangedCount}{" "}
              {diff.unchangedCount === 1 ? "event" : "events"} behaved
              identically.
            </p>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <EventList
            title="Removed events"
            events={diff.removed}
            tone="removed"
          />

          <EventList title="Added events" events={diff.added} tone="added" />
        </div>

        {diff.changed.length > 0 && (
          <section className="mt-6 rounded-2xl border border-white/[0.07] bg-[#0d1320] p-5">
            <h2 className="text-sm font-medium text-slate-200">
              Changed events{" "}
              <span className="text-slate-600">({diff.changed.length})</span>
            </h2>

            <ul className="mt-3 space-y-3">
              {diff.changed.map((change) => (
                <ChangedEvent key={change.key} change={change} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
