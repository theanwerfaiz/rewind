"use client";

import { ChevronDown, ChevronRight, ExternalLink, FlaskConical } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { EventIcon } from "@/components/ui/EventIcon";
import { IdChip } from "@/components/ui/IdChip";
import { buttonClass, JsonBlock } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime, formatMs } from "@/lib/format";

export type GraphRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  source: string | null;
  timestamp: string;
  depth: number;
  childIds: string[];
  parentId: string | null;
  orphan: boolean;
  offsetMs: number;
  durationMs: number;
  payload: unknown;
  metadata: Record<string, unknown> | null;
};

const LAB_TYPES = new Set(["http.request", "webhook.received"]);

/**
 * The execution tree with a waterfall, a keyboard-driven selection and an
 * inspector for the selected event.
 *
 * Keys: j / k or arrows move, h / l or left / right collapse and expand,
 * Enter opens the event.
 */
export function ExecutionGraph({
  rows,
  totalMs,
  failurePath,
  initialSelectedId,
}: {
  rows: GraphRow[];
  totalMs: number;
  failurePath: string[];
  initialSelectedId: string | null;
}) {
  const router = useRouter();

  const listRef = useRef<HTMLOListElement>(null);

  const [selectedId, setSelectedId] = useState(
    initialSelectedId ?? rows[0]?.id ?? null,
  );

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [failureOnly, setFailureOnly] = useState(false);

  const onPath = useMemo(() => new Set(failurePath), [failurePath]);

  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  const visible = useMemo(() => {
    return rows.filter((row) => {
      if (failureOnly && !onPath.has(row.id)) {
        return false;
      }

      // Hidden when any ancestor is collapsed.
      let parentId = row.parentId;

      while (parentId) {
        if (collapsed.has(parentId)) {
          return false;
        }

        parentId = byId.get(parentId)?.parentId ?? null;
      }

      return true;
    });
  }, [rows, failureOnly, onPath, collapsed, byId]);

  const selected = selectedId ? byId.get(selectedId) : undefined;

  const scaleMs = Math.max(totalMs, 1);

  function toggle(id: string, open?: boolean) {
    setCollapsed((current) => {
      const next = new Set(current);

      const isOpen = !next.has(id);

      if (open ?? !isOpen) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function select(id: string) {
    setSelectedId(id);

    listRef.current
      ?.querySelector(`[data-row="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const index = visible.findIndex((row) => row.id === selectedId);

    const current = visible[index];

    switch (event.key) {
      case "j":
      case "ArrowDown":
        if (index < visible.length - 1) {
          select(visible[index + 1].id);
        }
        break;

      case "k":
      case "ArrowUp":
        if (index > 0) {
          select(visible[index - 1].id);
        }
        break;

      case "h":
      case "ArrowLeft":
        if (current && current.childIds.length > 0 && !collapsed.has(current.id)) {
          toggle(current.id, false);
        } else if (current?.parentId && byId.has(current.parentId)) {
          select(current.parentId);
        }
        break;

      case "l":
      case "ArrowRight":
        if (current && collapsed.has(current.id)) {
          toggle(current.id, true);
        }
        break;

      case "Enter":
        if (current) {
          router.push(`/events/${current.id}`);
        }
        break;

      default:
        return;
    }

    event.preventDefault();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="text-xs text-muted">
            <kbd className="font-mono text-ink-2">j</kbd>/
            <kbd className="font-mono text-ink-2">k</kbd> move ·{" "}
            <kbd className="font-mono text-ink-2">h</kbd>/
            <kbd className="font-mono text-ink-2">l</kbd> fold ·{" "}
            <kbd className="font-mono text-ink-2">↵</kbd> open
          </div>

          <div className="flex items-center gap-3">
            {failurePath.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-2">
                <input
                  type="checkbox"
                  checked={failureOnly}
                  onChange={(event) => setFailureOnly(event.target.checked)}
                  className="accent-[var(--accent)]"
                />
                Failure path only
              </label>
            )}

            <span className="font-mono text-xs tabular-nums text-faint">
              0–{formatMs(totalMs)}
            </span>
          </div>
        </div>

        <ol
          ref={listRef}
          role="tree"
          aria-label="Execution graph"
          aria-activedescendant={selectedId ? `row-${selectedId}` : undefined}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="max-h-[640px] overflow-auto p-2 focus-visible:outline-offset-[-2px]"
        >
          {visible.map((row) => {
            const left = Math.min((row.offsetMs / scaleMs) * 100, 100);

            const width = Math.max((row.durationMs / scaleMs) * 100, 0.75);

            const isSelected = row.id === selectedId;

            const hasChildren = row.childIds.length > 0;

            const isCollapsed = collapsed.has(row.id);

            return (
              <li
                key={row.id}
                id={`row-${row.id}`}
                data-row={row.id}
                role="treeitem"
                aria-selected={isSelected}
                aria-expanded={hasChildren ? !isCollapsed : undefined}
                onClick={() => setSelectedId(row.id)}
                onDoubleClick={() => router.push(`/events/${row.id}`)}
                className={`grid cursor-pointer grid-cols-1 items-center gap-3 rounded-lg px-2 py-2 md:grid-cols-[minmax(0,1fr)_minmax(0,38%)] ${
                  isSelected
                    ? "bg-accent-soft ring-1 ring-accent/40"
                    : onPath.has(row.id)
                      ? "bg-failure-soft hover:bg-hover"
                      : "hover:bg-hover"
                }`}
              >
                <div
                  className="flex min-w-0 items-center gap-2"
                  style={{ paddingLeft: `${row.depth * 20}px` }}
                >
                  {hasChildren ? (
                    <button
                      type="button"
                      aria-label={isCollapsed ? "Expand" : "Collapse"}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggle(row.id);
                      }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:bg-raised hover:text-ink"
                    >
                      {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </button>
                  ) : (
                    <span className="w-5 shrink-0" />
                  )}

                  <EventIcon type={row.type} status={row.status} size="sm" />

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm text-ink">{row.title}</span>

                      {isCollapsed && (
                        <span className="shrink-0 rounded bg-raised px-1.5 text-xs text-muted">
                          +{row.childIds.length}
                        </span>
                      )}

                      {row.orphan && (
                        <span
                          title="This event names a parent that was not captured."
                          className="shrink-0 rounded bg-warning-soft px-1.5 py-0.5 text-xs text-warning"
                        >
                          missing parent
                        </span>
                      )}
                    </div>

                    <div className="truncate text-xs text-faint">
                      {row.type}
                      {row.source ? ` · ${row.source}` : ""}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative h-1.5 flex-1 rounded-full bg-raised">
                    <div
                      className={`absolute top-0 h-1.5 rounded-full ${
                        row.status === "error" ? "bg-failure" : "bg-accent/70"
                      }`}
                      style={{
                        left: `${left}%`,
                        width: `${Math.min(width, 100 - left)}%`,
                        minWidth: "4px",
                      }}
                    />
                  </div>

                  <span className="w-28 shrink-0 text-right font-mono text-xs tabular-nums text-faint">
                    +{formatMs(row.offsetMs)}
                    {row.durationMs > 0 ? ` · ${formatMs(row.durationMs)}` : ""}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <aside
        aria-label="Event inspector"
        className="min-w-0 self-start rounded-xl border border-line bg-panel xl:sticky xl:top-20"
      >
        {selected ? (
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-start gap-3">
              <EventIcon type={selected.type} status={selected.status} />

              <div className="min-w-0 flex-1">
                <h3 className="break-words text-sm font-medium text-ink">
                  {selected.title}
                </h3>

                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <StatusBadge status={selected.status} />
                  <IdChip id={selected.id} />
                </div>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-faint">Type</dt>
                <dd className="mt-0.5 font-mono text-ink-2">{selected.type}</dd>
              </div>

              <div>
                <dt className="text-faint">Source</dt>
                <dd className="mt-0.5 truncate font-mono text-ink-2">
                  {selected.source ?? "—"}
                </dd>
              </div>

              <div>
                <dt className="text-faint">Offset</dt>
                <dd className="mt-0.5 font-mono tabular-nums text-ink-2">
                  +{formatMs(selected.offsetMs)}
                </dd>
              </div>

              <div>
                <dt className="text-faint">Duration</dt>
                <dd className="mt-0.5 font-mono tabular-nums text-ink-2">
                  {selected.durationMs > 0 ? formatMs(selected.durationMs) : "—"}
                </dd>
              </div>

              <div className="col-span-2">
                <dt className="text-faint">Time</dt>
                <dd className="mt-0.5 font-mono text-ink-2">
                  {formatDateTime(selected.timestamp)}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2">
              <Link href={`/events/${selected.id}`} className={buttonClass("secondary")}>
                <ExternalLink size={14} />
                Open event
              </Link>

              {LAB_TYPES.has(selected.type) && (
                <Link href={`/lab/${selected.id}`} className={buttonClass("primary")}>
                  <FlaskConical size={14} />
                  Replay Lab
                </Link>
              )}
            </div>

            <div>
              <div className="mb-1.5 text-xs text-faint">Payload</div>
              <JsonBlock value={selected.payload} maxHeight="max-h-72" />
            </div>

            {selected.metadata && Object.keys(selected.metadata).length > 0 && (
              <div>
                <div className="mb-1.5 text-xs text-faint">Metadata</div>
                <JsonBlock value={selected.metadata} maxHeight="max-h-56" />
              </div>
            )}
          </div>
        ) : (
          <p className="p-4 text-sm text-muted">Select an event to inspect it.</p>
        )}
      </aside>
    </div>
  );
}
