"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type InvariantItem = {
  id: string;
  description: string;
  passed: boolean;
  actual: string;
};

export type InvariantSuggestion = {
  description: string;
  definition: Record<string, unknown>;
};

const KINDS = [
  ["http_status", "HTTP status is"],
  ["max_duration_ms", "Completes within (ms)"],
  ["response_field", "Response field equals"],
  ["event_exists", "Event happens"],
  ["event_absent", "Event never happens"],
  ["max_event_count", "Event happens at most"],
  ["no_unhandled_errors", "No unhandled errors"],
] as const;

type Kind = (typeof KINDS)[number][0];

const inputClass =
  "h-9 min-w-0 rounded-lg border border-line bg-canvas px-2.5 font-mono text-xs text-ink outline-none transition placeholder:text-faint focus:border-accent";

function parseValue(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function buildDefinition(kind: Kind, first: string, second: string) {
  switch (kind) {
    case "http_status":
      return { kind, equals: Number(first) };

    case "max_duration_ms":
      return { kind, value: Number(first) };

    case "response_field":
      return { kind, path: first.trim(), equals: parseValue(second) };

    case "event_exists":
    case "event_absent":
      return { kind, title: first };

    case "max_event_count":
      return { kind, title: first, max: Number(second) };

    case "no_unhandled_errors":
      return { kind };
  }
}

export function InvariantPanel({
  executionId,
  items,
  suggestions,
}: {
  executionId: string;
  items: InvariantItem[];
  suggestions: InvariantSuggestion[];
}) {
  const router = useRouter();

  const [kind, setKind] = useState<Kind>("http_status");

  const [first, setFirst] = useState("");

  const [second, setSecond] = useState("");

  const [error, setError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);

  async function add(definition: Record<string, unknown>) {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/executions/${executionId}/invariants`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(definition),
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);

        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `Could not add the invariant (HTTP ${response.status}).`,
        );
      }

      setFirst("");
      setSecond("");
      router.refresh();
    } catch (addError) {
      setError(
        addError instanceof Error
          ? addError.message
          : "Could not add the invariant.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);

    await fetch(`/api/invariants/${id}`, {
      method: "DELETE",
    }).catch(() => null);

    setBusy(false);
    router.refresh();
  }

  const existing = new Set(items.map((item) => item.description));

  const openSuggestions = suggestions.filter(
    (suggestion) => !existing.has(suggestion.description),
  );

  return (
    <section className="mb-8 rounded-2xl border border-line bg-panel p-6">
      <h2 className="text-sm font-medium text-ink">Invariants</h2>

      <p className="mt-1 text-xs text-faint">
        What must be true when this works. Replays and verifications check them;
        a fix only verifies when they hold.
      </p>

      {items.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-lg bg-canvas px-3 py-2 text-sm"
            >
              <span
                className={`w-12 shrink-0 font-mono text-xs ${
                  item.passed ? "text-success" : "text-failure"
                }`}
              >
                {item.passed ? "holds" : "fails"}
              </span>

              <span className="min-w-0 flex-1 truncate text-ink">
                {item.description}
              </span>

              <span className="shrink-0 font-mono text-xs text-faint">
                here: {item.actual}
              </span>

              <button
                type="button"
                aria-label={`Remove ${item.description}`}
                disabled={busy}
                onClick={() => remove(item.id)}
                className="shrink-0 text-faint transition hover:text-ink"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {openSuggestions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {openSuggestions.map((suggestion) => (
            <button
              key={suggestion.description}
              type="button"
              disabled={busy}
              onClick={() => add(suggestion.definition)}
              className="rounded-full border border-line px-3 py-1 text-xs text-ink-2 transition hover:border-line-strong hover:text-ink"
            >
              + {suggestion.description}
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-4 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add(buildDefinition(kind, first, second));
        }}
      >
        <select
          aria-label="Invariant kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as Kind)}
          className={inputClass}
        >
          {KINDS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {kind !== "no_unhandled_errors" && (
          <input
            aria-label="Invariant value"
            value={first}
            onChange={(event) => setFirst(event.target.value)}
            placeholder={
              kind === "response_field"
                ? "order.status"
                : kind === "http_status"
                  ? "200"
                  : kind === "max_duration_ms"
                    ? "1000"
                    : "event title"
            }
            className={`${inputClass} min-w-40 flex-1`}
          />
        )}

        {(kind === "response_field" || kind === "max_event_count") && (
          <input
            aria-label={kind === "response_field" ? "Expected value" : "Times"}
            value={second}
            onChange={(event) => setSecond(event.target.value)}
            placeholder={kind === "response_field" ? '"paid"' : "1"}
            className={`${inputClass} w-28`}
          />
        )}

        <button
          type="submit"
          disabled={busy}
          className="h-9 rounded-lg bg-accent px-3 text-xs font-medium text-accent-ink transition hover:brightness-110 disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {error && <p className="mt-2 text-xs text-failure">{error}</p>}
    </section>
  );
}
