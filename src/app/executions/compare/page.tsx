import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { compareExecutions } from "@/lib/execution-compare";
import type {
  DiffOutcome,
  EventChange,
  EventChangeKind,
} from "@/lib/execution-diff";
import { ComparePicker } from "@/components/executions/ComparePicker";
import { SideBySideDiff } from "@/components/executions/SideBySideDiff";
import { PageHeader } from "@/components/ui/PageHeader";
import { IdChip } from "@/components/ui/IdChip";
import { shortId } from "@/lib/format";

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
    className: "border-success/30 bg-success-soft text-success",
  },
  regressed: {
    title: "Regressed",
    detail: "The original succeeded; this execution failed.",
    className: "border-failure/30 bg-failure-soft text-failure",
  },
  still_failing: {
    title: "Still failing",
    detail: "Both executions failed the same way (same fingerprint).",
    className: "border-failure/30 bg-failure-soft text-failure",
  },
  different_failure: {
    title: "Different failure",
    detail: "Both executions failed, but not the same way.",
    className: "border-warning/30 bg-warning-soft text-warning",
  },
  behavior_changed: {
    title: "Behaviour changed",
    detail: "Both executions succeeded, but took a different path.",
    className: "border-accent/30 bg-accent-soft text-accent",
  },
  unchanged: {
    title: "Unchanged",
    detail: "Same events, statuses and responses.",
    className: "border-line bg-panel text-ink",
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
      className="block rounded-2xl border border-line bg-panel p-5 transition hover:border-line-strong"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-2">
          {label}
        </span>

        <span
          className={`rounded px-2 py-0.5 text-xs uppercase ${
            side.status === "error"
              ? "bg-failure-soft text-failure"
              : "bg-success-soft text-success"
          }`}
        >
          {side.status}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 font-mono text-sm text-ink">
        <div>
          <div className="text-xs uppercase tracking-wider text-faint">
            HTTP
          </div>
          {side.httpStatus ?? "—"}
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-faint">
            Duration
          </div>
          {formatMs(side.durationMs)}
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-faint">
            Events
          </div>
          {side.eventCount}
        </div>
      </div>

      <div className="mt-4 truncate font-mono text-xs text-faint">
        {side.executionId}
      </div>
    </Link>
  );
}

function ChangedEvent({ change }: { change: EventChange }) {
  const fieldChanges = [...change.payloadChanges, ...change.responseChanges];

  return (
    <li className="rounded-xl border border-line bg-canvas p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/events/${change.candidate.id}`}
          className="text-sm text-ink hover:text-ink"
        >
          {change.candidate.title}
        </Link>

        {change.kinds.map((kind) => (
          <span
            key={kind}
            className="rounded bg-accent-soft px-1.5 py-0.5 text-xs uppercase tracking-wider text-accent"
          >
            {KIND_LABELS[kind]}
          </span>
        ))}
      </div>

      <dl className="mt-3 space-y-1 font-mono text-xs text-ink-2">
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
          <div className="text-faint">
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

  if (
    typeof original !== "string" ||
    typeof candidate !== "string" ||
    original === "" ||
    candidate === ""
  ) {
    return (
      <ComparePicker
        original={typeof original === "string" ? original : undefined}
        candidate={typeof candidate === "string" ? candidate : undefined}
      />
    );
  }

  const diff = compareExecutions(original, candidate);

  if (!diff) {
    notFound();
  }

  const outcome = OUTCOMES[diff.outcome];

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Executions", href: "/executions" },
          { label: shortId(original), href: `/executions/${original}` },
          { label: "Compare" },
        ]}
        title="Execution diff"
        meta={
          <>
            <IdChip id={original} />
            <span className="text-faint">vs</span>
            <IdChip id={candidate} />
          </>
        }
      />

        <section className={`mb-6 rounded-2xl border p-6 ${outcome.className}`}>
          <h2 className="text-2xl font-semibold tracking-tight">
            {outcome.title}
          </h2>

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
                className="underline decoration-current/40 underline-offset-4 hover:decoration-current"
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
          <section className="mb-6 rounded-2xl border border-line bg-panel p-5">
            <h2 className="text-sm font-medium text-ink">What changed</h2>

            <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
              {diff.summary.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="text-faint">•</span>
                  {line}
                </li>
              ))}
            </ul>

            <p className="mt-4 text-xs text-faint">
              {diff.unchangedCount}{" "}
              {diff.unchangedCount === 1 ? "event" : "events"} behaved
              identically.
            </p>
          </section>
        )}

        {diff.invariants && diff.invariants.length > 0 && (
          <section className="mb-6 rounded-2xl border border-line bg-panel p-5">
            <h2 className="text-sm font-medium text-ink">Invariants</h2>

            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-faint">
                  <th className="pb-2 font-normal">Expected</th>
                  <th className="pb-2 font-normal">Original</th>
                  <th className="pb-2 font-normal">Candidate</th>
                </tr>
              </thead>

              <tbody>
                {diff.invariants.map((comparison) => (
                  <tr
                    key={comparison.invariant.id}
                    className="border-t border-line"
                  >
                    <td className="py-2 pr-4 text-ink">
                      {comparison.description}
                    </td>

                    {[comparison.original, comparison.candidate].map(
                      (result, index) => (
                        <td
                          key={index}
                          className={`py-2 pr-4 font-mono text-xs ${
                            result.passed ? "text-success" : "text-failure"
                          }`}
                        >
                          {result.passed ? "holds" : "fails"}{" "}
                          <span className="text-faint">
                            ({result.actual})
                          </span>
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <SideBySideDiff rows={diff.rows} />

        {diff.changed.length > 0 && (
          <section className="mt-6 rounded-2xl border border-line bg-panel p-5">
            <h2 className="text-sm font-medium text-ink">
              Field changes{" "}
              <span className="text-faint">({diff.changed.length})</span>
            </h2>

            <ul className="mt-3 space-y-3">
              {diff.changed.map((change) => (
                <ChangedEvent key={change.key} change={change} />
              ))}
            </ul>
          </section>
        )}
      </>
  );
}
