"use client";

import { useMemo, useState } from "react";

import { findReplayChanges } from "@/lib/replay-diff";

type ReplayComparisonProps = {
  originalPayload: unknown;
  replayPayload: unknown;
};

function formatJson(value: unknown) {
  if (value === undefined || value === null) {
    return "No payload";
  }

  return JSON.stringify(value, null, 2);
}

function formatValue(value: unknown) {
  if (value === undefined) {
    return "undefined";
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return `"${value}"`;
  }

  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

function changeLabel(type: "added" | "removed" | "changed") {
  if (type === "added") {
    return "Added";
  }

  if (type === "removed") {
    return "Removed";
  }

  return "Changed";
}

function changeClass(type: "added" | "removed" | "changed") {
  if (type === "added") {
    return "bg-emerald-500/10 text-emerald-400";
  }

  if (type === "removed") {
    return "bg-red-500/10 text-red-400";
  }

  return "bg-amber-500/10 text-amber-400";
}

export function ReplayComparison({
  originalPayload,
  replayPayload,
}: ReplayComparisonProps) {
  const [view, setView] = useState<"side-by-side" | "json">("side-by-side");

  const changes = useMemo(
    () => findReplayChanges(originalPayload, replayPayload),
    [originalPayload, replayPayload],
  );

  const originalJson = formatJson(originalPayload);

  const replayJson = formatJson(replayPayload);

  const identical = changes.length === 0;

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-medium">Replay Comparison</h2>

          <p className="mt-1 text-sm text-slate-500">
            Compare the captured payload with the payload actually replayed.
          </p>
        </div>

        <div
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            identical
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-amber-500/10 text-amber-400"
          }`}
        >
          {identical
            ? "No changes"
            : `${changes.length} ${
                changes.length === 1 ? "change" : "changes"
              }`}
        </div>
      </div>

      <div className="mb-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setView("side-by-side")}
          className={`rounded-lg border px-3 py-2 text-sm transition ${
            view === "side-by-side"
              ? "border-white/20 bg-white/10 text-white"
              : "border-white/10 bg-black/20 text-slate-500 hover:text-white"
          }`}
        >
          Side by side
        </button>

        <button
          type="button"
          onClick={() => setView("json")}
          className={`rounded-lg border px-3 py-2 text-sm transition ${
            view === "json"
              ? "border-white/20 bg-white/10 text-white"
              : "border-white/10 bg-black/20 text-slate-500 hover:text-white"
          }`}
        >
          JSON
        </button>
      </div>

      {view === "side-by-side" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <PayloadPanel
            title="Original"
            description="Captured event payload"
            value={originalJson}
          />

          <PayloadPanel
            title="Replay"
            description="Payload sent during replay"
            value={replayJson}
          />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <JsonColumn title="Original" value={originalJson} />

          <JsonColumn title="Replay" value={replayJson} />
        </div>
      )}

      {!identical ? (
        <div className="mt-6">
          <div className="mb-3">
            <h3 className="text-sm font-medium text-slate-300">Changes</h3>

            <p className="mt-1 text-xs text-slate-600">
              Field-level differences between the captured and replayed
              payloads.
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-white/5">
            <div className="divide-y divide-white/5">
              {changes.map((change, index) => (
                <div
                  key={`${change.path}-${index}`}
                  className="bg-black/20 px-4 py-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-mono text-sm text-slate-300">
                        {change.path}
                      </div>

                      <div className="mt-2 flex flex-col gap-2 text-sm sm:flex-row sm:items-center">
                        {change.type !== "added" ? (
                          <ValueBox
                            label="Original"
                            value={change.original}
                            type="original"
                          />
                        ) : null}

                        {change.type === "changed" ? (
                          <span className="text-slate-600">→</span>
                        ) : null}

                        {change.type === "removed" ? (
                          <span className="text-slate-600">→</span>
                        ) : null}

                        {change.type !== "removed" ? (
                          <ValueBox
                            label="Replay"
                            value={change.replay}
                            type="replay"
                          />
                        ) : null}
                      </div>
                    </div>

                    <span
                      className={`shrink-0 self-start rounded-full px-2.5 py-1 text-xs font-medium ${changeClass(
                        change.type,
                      )}`}
                    >
                      {changeLabel(change.type)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ValueBox({
  label,
  value,
  type,
}: {
  label: string;
  value: unknown;
  type: "original" | "replay";
}) {
  return (
    <div
      className={`max-w-full rounded-lg border px-3 py-2 ${
        type === "original"
          ? "border-red-500/10 bg-red-500/5"
          : "border-emerald-500/10 bg-emerald-500/5"
      }`}
    >
      <span className="mr-2 text-xs text-slate-600">{label}:</span>

      <code className="break-all text-xs text-slate-300">
        {formatValue(value)}
      </code>
    </div>
  );
}

function PayloadPanel({
  title,
  description,
  value,
}: {
  title: string;
  description: string;
  value: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/5 bg-black/20">
      <div className="border-b border-white/5 px-4 py-3">
        <div className="text-sm font-medium text-slate-300">{title}</div>

        <div className="mt-1 text-xs text-slate-600">{description}</div>
      </div>

      <pre className="max-h-96 overflow-auto p-4 text-sm leading-6 text-slate-300">
        {value}
      </pre>
    </div>
  );
}

function JsonColumn({ title, value }: { title: string; value: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/5 bg-black/20">
      <div className="border-b border-white/5 px-4 py-3 text-sm font-medium text-slate-300">
        {title}
      </div>

      <pre className="max-h-96 overflow-auto p-4 text-sm leading-6 text-slate-300">
        {value}
      </pre>
    </div>
  );
}
