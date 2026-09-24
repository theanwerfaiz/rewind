"use client";

import { Bookmark, Filter, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { buttonClass } from "@/components/ui/primitives";

type SavedView = { name: string; query: string };

const STORAGE_KEY = "rewind.executions.savedViews";

const PRESETS: SavedView[] = [
  { name: "Real failures", query: "is:failed" },
  { name: "Last hour", query: "since:1h" },
  { name: "Slow", query: "duration:>1s" },
  { name: "Replays", query: "is:replay" },
];

// Saved views are a per-browser convenience, so they live in localStorage;
// every read and write tolerates storage being unavailable.
const listeners = new Set<() => void>();

let cachedRaw: string | null = null;

let cachedViews: SavedView[] = [];

function readViews(): SavedView[] {
  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return cachedViews;
  }

  if (raw === cachedRaw) {
    return cachedViews;
  }

  cachedRaw = raw;

  try {
    const parsed = JSON.parse(raw ?? "[]");

    cachedViews = Array.isArray(parsed)
      ? parsed.filter(
          (view): view is SavedView =>
            typeof view?.name === "string" && typeof view?.query === "string",
        )
      : [];
  } catch {
    cachedViews = [];
  }

  return cachedViews;
}

function writeViews(views: SavedView[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    cachedViews = views;
  }

  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

const NO_VIEWS: SavedView[] = [];

export function FilterBar({
  query,
  errors,
  matched,
  total,
}: {
  query: string;
  errors: string[];
  matched: number;
  total: number;
}) {
  const router = useRouter();

  const [draft, setDraft] = useState(query);

  const saved = useSyncExternalStore(subscribe, readViews, () => NO_VIEWS);

  function apply(next: string) {
    const trimmed = next.trim();

    setDraft(trimmed);

    router.push(trimmed ? `/executions?q=${encodeURIComponent(trimmed)}` : "/executions");
  }

  function saveCurrent() {
    const trimmed = query.trim();

    if (!trimmed || saved.some((view) => view.query === trimmed)) {
      return;
    }

    const name = window.prompt("Name this view", trimmed.slice(0, 40));

    if (name && name.trim()) {
      writeViews([...saved, { name: name.trim().slice(0, 40), query: trimmed }]);
    }
  }

  const views = [...PRESETS, ...saved];

  return (
    <div className="mb-4 space-y-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply(draft);
        }}
        className="flex gap-2"
      >
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-panel px-3 focus-within:border-accent">
          <Filter size={15} className="shrink-0 text-muted" />

          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="status:error endpoint:/checkout since:24h -is:replay"
            aria-label="Filter executions"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent font-mono text-sm text-ink outline-none placeholder:text-faint"
          />

          {draft && (
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => apply("")}
              className="text-muted hover:text-ink"
            >
              <X size={15} />
            </button>
          )}
        </label>

        <button type="submit" className={`${buttonClass("primary")} h-10`}>
          Filter
        </button>

        {query && !saved.some((view) => view.query === query) && !PRESETS.some((view) => view.query === query) && (
          <button
            type="button"
            onClick={saveCurrent}
            className={`${buttonClass("secondary")} h-10`}
          >
            <Bookmark size={14} />
            <span className="hidden sm:inline">Save view</span>
          </button>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {views.map((view) => {
          const active = view.query === query;

          const isSaved = !PRESETS.includes(view);

          return (
            <span
              key={`${isSaved ? "saved" : "preset"}:${view.query}`}
              className={`inline-flex items-center rounded-full border ${
                active
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-line bg-panel text-ink-2"
              }`}
            >
              <button
                type="button"
                onClick={() => apply(active ? "" : view.query)}
                title={view.query}
                className="px-2.5 py-1 hover:text-ink"
              >
                {view.name}
              </button>

              {isSaved && (
                <button
                  type="button"
                  aria-label={`Delete view ${view.name}`}
                  onClick={() => writeViews(saved.filter((item) => item !== view))}
                  className="pr-2 text-muted hover:text-ink"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          );
        })}

        <span className="ml-auto font-mono tabular-nums text-muted">
          {query ? `${matched} of ${total}` : `${total} recent`}
        </span>
      </div>

      {errors.length > 0 && (
        <ul className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
          {errors.map((error) => (
            <li key={error}>{error} That part of the filter was ignored.</li>
          ))}
        </ul>
      )}
    </div>
  );
}
