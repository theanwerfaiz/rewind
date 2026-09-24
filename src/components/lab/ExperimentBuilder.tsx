"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Target = "payload" | "header" | "query";

type Op = "set" | "remove";

type Row = {
  key: number;
  target: Target;
  op: Op;
  name: string;
  value: string;
};

type ExperimentResult = {
  id: string;
  label: string | null;
  status: number;
  statusText: string;
  duration: string;
  body: unknown;
  sourceExecutionId: string | null;
  resultExecutionId: string | null;
};

let nextKey = 1;

function emptyRow(): Row {
  return {
    key: nextKey++,
    target: "payload",
    op: "set",
    name: "",
    value: "",
  };
}

/**
 * Payload values are parsed as JSON when possible, so `0`, `true`, `null`
 * and objects keep their types; anything else is sent as a string.
 */
function parsePayloadValue(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toMutation(row: Row) {
  if (row.target === "payload") {
    return row.op === "set"
      ? {
          target: row.target,
          op: row.op,
          path: row.name.trim(),
          value: parsePayloadValue(row.value),
        }
      : {
          target: row.target,
          op: row.op,
          path: row.name.trim(),
        };
  }

  return row.op === "set"
    ? {
        target: row.target,
        op: row.op,
        name: row.name.trim(),
        value: row.value,
      }
    : {
        target: row.target,
        op: row.op,
        name: row.name.trim(),
      };
}

const inputClass =
  "h-9 min-w-0 rounded-lg border border-white/10 bg-black/30 px-2.5 font-mono text-xs text-slate-200 outline-none transition placeholder:text-slate-700 focus:border-white/25";

export function ExperimentBuilder({ eventId }: { eventId: string }) {
  const router = useRouter();

  const [label, setLabel] = useState("");

  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);

  const [running, setRunning] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<ExperimentResult | null>(null);

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);

    const mutations = rows
      .filter((row) => row.name.trim() !== "")
      .map(toMutation);

    try {
      const response = await fetch("/api/replay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId,
          label: label.trim() || undefined,
          mutations,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.replay) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `Experiment failed with HTTP ${response.status}.`,
        );
      }

      setResult(data.replay as ExperimentResult);

      router.refresh();
    } catch (runError) {
      setError(
        runError instanceof Error ? runError.message : "Experiment failed.",
      );
    } finally {
      setRunning(false);
    }
  }

  const resultOk = result !== null && result.status < 400;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.03] p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">
          Experiment
        </div>

        <p className="mt-1 text-xs text-slate-500">
          Change one variable at a time. Mutations are stored with the
          experiment so it can be run again.
        </p>

        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Label, e.g. zero amount"
          maxLength={120}
          className={`${inputClass} mt-4 w-full font-sans`}
        />

        <div className="mt-4 space-y-2">
          {rows.map((row) => (
            <div
              key={row.key}
              className="space-y-2 rounded-xl border border-white/[0.06] bg-black/10 p-2"
            >
              <div className="flex items-center gap-2">
                <select
                  aria-label="Target"
                  value={row.target}
                  onChange={(event) =>
                    updateRow(row.key, {
                      target: event.target.value as Target,
                    })
                  }
                  className={`${inputClass} flex-1`}
                >
                  <option value="payload">payload</option>
                  <option value="header">header</option>
                  <option value="query">query</option>
                </select>

                <select
                  aria-label="Operation"
                  value={row.op}
                  onChange={(event) =>
                    updateRow(row.key, {
                      op: event.target.value as Op,
                    })
                  }
                  className={`${inputClass} flex-1`}
                >
                  <option value="set">set</option>
                  <option value="remove">remove</option>
                </select>

                <button
                  type="button"
                  aria-label="Remove mutation"
                  onClick={() =>
                    setRows((current) =>
                      current.length === 1
                        ? [emptyRow()]
                        : current.filter((item) => item.key !== row.key),
                    )
                  }
                  className="h-9 w-9 shrink-0 rounded-lg border border-white/10 text-slate-500 transition hover:text-slate-200"
                >
                  ×
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  aria-label={row.target === "payload" ? "Path" : "Name"}
                  value={row.name}
                  onChange={(event) =>
                    updateRow(row.key, {
                      name: event.target.value,
                    })
                  }
                  placeholder={
                    row.target === "payload" ? "items.0.price" : "name"
                  }
                  className={`${inputClass} flex-1`}
                />

                {row.op === "set" && (
                  <>
                    <span className="text-xs text-slate-600">=</span>

                    <input
                      aria-label="Value"
                      value={row.value}
                      onChange={(event) =>
                        updateRow(row.key, {
                          value: event.target.value,
                        })
                      }
                      placeholder={row.target === "payload" ? "0" : "value"}
                      className={`${inputClass} flex-1`}
                    />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setRows((current) => [...current, emptyRow()])}
            className="text-xs text-slate-400 transition hover:text-slate-200"
          >
            + Add mutation
          </button>

          <button
            type="button"
            onClick={run}
            disabled={running}
            className="flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? "Running…" : "↻ Run experiment"}
          </button>
        </div>

        <p className="mt-3 text-[11px] text-slate-600">
          Payload values are parsed as JSON (<code>0</code>, <code>true</code>
          , <code>{"{}"}</code>); anything else is sent as text. With no
          mutations, this is a plain replay.
        </p>
      </section>

      <section className="rounded-2xl border border-white/[0.07] bg-[#0d1320] p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          Result
        </div>

        {!result && !error && (
          <p className="mt-6 text-sm text-slate-600">
            Run an experiment to see how the application behaves.
          </p>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`rounded-lg px-2.5 py-1 font-mono text-sm ${
                  resultOk
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "bg-red-500/10 text-red-300"
                }`}
              >
                {result.status} {result.statusText}
              </span>

              <span className="font-mono text-xs text-slate-500">
                {result.duration}
              </span>
            </div>

            <div className="flex flex-wrap gap-3 text-xs">
              {result.resultExecutionId ? (
                <Link
                  href={`/executions/${result.resultExecutionId}`}
                  className="text-blue-300 hover:text-blue-200"
                >
                  Resulting execution →
                </Link>
              ) : (
                <span className="text-slate-600">
                  The target did not capture an execution.
                </span>
              )}

              {result.resultExecutionId && result.sourceExecutionId && (
                <Link
                  href={`/executions/compare?original=${result.sourceExecutionId}&candidate=${result.resultExecutionId}`}
                  className="text-blue-300 hover:text-blue-200"
                >
                  Diff executions →
                </Link>
              )}

              <Link
                href={`/replays/${result.id}`}
                className="text-slate-400 hover:text-slate-200"
              >
                Compare responses →
              </Link>
            </div>

            <pre className="max-h-80 overflow-auto rounded-xl border border-white/10 bg-black/30 p-4 text-xs leading-5 text-slate-300">
              {JSON.stringify(result.body, null, 2)}
            </pre>
          </div>
        )}
      </section>
    </div>
  );
}
