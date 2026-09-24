import Link from "next/link";

import { EventIcon } from "@/components/ui/EventIcon";
import type {
  AlignedRow,
  AlignedRowSide,
  EventChangeKind,
} from "@/lib/execution-diff";
import { formatMs } from "@/lib/format";

const KIND_LABELS: Record<EventChangeKind, string> = {
  status: "status",
  http_status: "HTTP",
  response: "response",
  payload: "request",
  timing: "timing",
};

const ROW_TONES: Record<AlignedRow["state"], string> = {
  same: "",
  changed: "bg-warning-soft",
  added: "bg-success-soft",
  removed: "bg-failure-soft",
};

const MARKS: Record<AlignedRow["state"], { symbol: string; className: string; label: string }> = {
  same: { symbol: "", className: "text-faint", label: "unchanged" },
  changed: { symbol: "~", className: "text-warning", label: "changed" },
  added: { symbol: "+", className: "text-success", label: "added" },
  removed: { symbol: "−", className: "text-failure", label: "removed" },
};

function httpStatusOf(side: AlignedRowSide) {
  const response = (side.event.metadata as { response?: { status?: unknown } } | undefined)
    ?.response;

  return typeof response?.status === "number" ? response.status : null;
}

function Cell({
  side,
  depth,
  state,
}: {
  side: AlignedRowSide | null;
  depth: number;
  state: AlignedRow["state"];
}) {
  if (!side) {
    return (
      <div className="flex h-full items-center px-3 py-2 text-xs text-faint">
        <span style={{ paddingLeft: `${depth * 16}px` }}>
          {state === "added" ? "not in original" : "not in candidate"}
        </span>
      </div>
    );
  }

  const httpStatus = httpStatusOf(side);

  return (
    <Link
      href={`/events/${side.event.id}`}
      className="flex min-w-0 items-center gap-2 px-3 py-2 transition hover:bg-hover"
    >
      <span style={{ width: `${depth * 16}px` }} className="shrink-0" />

      <EventIcon type={side.event.type} status={side.event.status} size="sm" />

      <span className="min-w-0 flex-1 truncate text-sm text-ink">
        {side.event.title}
      </span>

      {httpStatus !== null && (
        <span
          className={`shrink-0 font-mono text-xs tabular-nums ${
            httpStatus >= 400 ? "text-failure" : "text-muted"
          }`}
        >
          {httpStatus}
        </span>
      )}

      <span className="hidden w-14 shrink-0 text-right font-mono text-xs tabular-nums text-faint sm:block">
        +{formatMs(side.offsetMs)}
      </span>
    </Link>
  );
}

/**
 * Both executions as aligned trees: a matched event shares a row, an added
 * or removed one leaves a gap on the other side.
 */
export function SideBySideDiff({
  rows,
  originalLabel = "Original",
  candidateLabel = "Candidate",
}: {
  rows: AlignedRow[];
  originalLabel?: string;
  candidateLabel?: string;
}) {
  const counts = rows.reduce(
    (total, row) => ({ ...total, [row.state]: total[row.state] + 1 }),
    { same: 0, changed: 0, added: 0, removed: 0 },
  );

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-medium text-ink">Side by side</h2>

        <div className="flex flex-wrap gap-3 text-xs text-muted">
          {(["changed", "added", "removed", "same"] as const).map((state) => (
            <span key={state} className="flex items-center gap-1.5">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-sm border border-line ${
                  ROW_TONES[state] || "bg-panel"
                }`}
              />
              {counts[state]} {MARKS[state].label}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)] border-b border-line text-xs font-medium uppercase tracking-wider text-faint">
            <span />
            <span className="px-3 py-2">{originalLabel}</span>
            <span className="border-l border-line px-3 py-2">{candidateLabel}</span>
          </div>

          <ol>
            {rows.map((row) => {
              const mark = MARKS[row.state];

              return (
                <li
                  key={`${row.state}:${row.key}`}
                  className={`grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)] border-b border-line last:border-0 ${ROW_TONES[row.state]}`}
                >
                  <span
                    title={
                      row.kinds.length > 0
                        ? `changed: ${row.kinds.map((kind) => KIND_LABELS[kind]).join(", ")}`
                        : mark.label
                    }
                    className={`flex items-center justify-center font-mono text-sm ${mark.className}`}
                  >
                    <span aria-hidden="true">{mark.symbol}</span>
                    <span className="sr-only">{mark.label}</span>
                  </span>

                  <Cell side={row.original} depth={row.depth} state={row.state} />

                  <div className="min-w-0 border-l border-line">
                    <div className="flex items-center">
                      <div className="min-w-0 flex-1">
                        <Cell side={row.candidate} depth={row.depth} state={row.state} />
                      </div>

                      {row.kinds.length > 0 && (
                        <div className="hidden shrink-0 gap-1 pr-3 lg:flex">
                          {row.kinds.map((kind) => (
                            <span
                              key={kind}
                              className="rounded bg-raised px-1.5 py-0.5 text-xs text-ink-2"
                            >
                              {KIND_LABELS[kind]}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
