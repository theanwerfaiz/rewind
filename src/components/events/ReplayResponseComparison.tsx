"use client";

import { useMemo, useState } from "react";

import { findReplayChanges } from "@/lib/replay-diff";

type ReplayResponseComparisonProps = {
  originalStatus: number | undefined;
  originalBody: unknown;
  replayStatus: number;
  replayBody: unknown;
};

function formatJson(value: unknown) {
  if (value === undefined || value === null) {
    return "No body";
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

function statusClass(status: number | undefined) {
  if (status === undefined) {
    return "bg-white/10 text-slate-400";
  }

  if (status >= 200 && status < 300) {
    return "bg-emerald-500/10 text-emerald-400";
  }

  if (status >= 400) {
    return "bg-red-500/10 text-red-400";
  }

  return "bg-amber-500/10 text-amber-400";
}

export function ReplayResponseComparison({
  originalStatus,
  originalBody,
  replayStatus,
  replayBody,
}: ReplayResponseComparisonProps) {
  const [view, setView] = useState<"side-by-side" | "json">("side-by-side");

  const bodyChanges = useMemo(
    () => findReplayChanges(originalBody, replayBody),
    [originalBody, replayBody],
  );

  const statusChanged = originalStatus !== replayStatus;

  const hasChanges = statusChanged || bodyChanges.length > 0;

  const originalJson = formatJson(originalBody);

  const replayJson = formatJson(replayBody);

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-medium">Response Comparison</h2>

          <p className="mt-1 text-sm text-slate-500">
            Compare the original application response with the replay response.
          </p>
        </div>

        <div
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            hasChanges
              ? "bg-amber-500/10 text-amber-400"
              : "bg-emerald-500/10 text-emerald-400"
          }`}
        >
          {hasChanges
            ? `${bodyChanges.length + (statusChanged ? 1 : 0)} ${
                bodyChanges.length + (statusChanged ? 1 : 0) === 1
                  ? "change"
                  : "changes"
              }`
            : "No changes"}
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
          <ResponsePanel
            title="Original"
            description="Captured application response"
            status={originalStatus}
            body={originalJson}
          />

          <ResponsePanel
            title="Replay"
            description="Response returned by replay"
            status={replayStatus}
            body={replayJson}
          />
        </div>
      ) : null}

      {view === "json" ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <JsonColumn title="Original response" value={originalJson} />

          <JsonColumn title="Replay response" value={replayJson} />
        </div>
      ) : null}

      {hasChanges ? (
        <div className="mt-6">
          <div className="mb-3">
            <h3 className="text-sm font-medium text-slate-300">
              Response Changes
            </h3>

            <p className="mt-1 text-xs text-slate-600">
              Differences between the original and replay responses.
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-white/5">
            <div className="divide-y divide-white/5">
              {statusChanged ? (
                <div className="bg-black/20 px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-mono text-sm text-slate-300">
                        status
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={`rounded-md px-2 py-1 text-xs font-medium ${statusClass(
                            originalStatus,
                          )}`}
                        >
                          {originalStatus ?? "unknown"}
                        </span>

                        <span className="text-slate-600">→</span>

                        <span
                          className={`rounded-md px-2 py-1 text-xs font-medium ${statusClass(
                            replayStatus,
                          )}`}
                        >
                          {replayStatus}
                        </span>
                      </div>
                    </div>

                    <span className="self-start rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400">
                      Changed
                    </span>
                  </div>
                </div>
              ) : null}

              {bodyChanges.map((change, index) => (
                <div
                  key={`${change.path}-${index}`}
                  className="bg-black/20 px-4 py-4"
                >
                  <div className="font-mono text-sm text-slate-300">
                    {change.path}
                  </div>

                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                    {change.original !== undefined ? (
                      <div className="rounded-lg border border-red-500/10 bg-red-500/5 px-3 py-2">
                        <span className="mr-2 text-xs text-slate-600">
                          Original:
                        </span>

                        <code className="break-all text-xs text-slate-300">
                          {formatValue(change.original)}
                        </code>
                      </div>
                    ) : null}

                    <span className="text-slate-600">→</span>

                    {change.replay !== undefined ? (
                      <div className="rounded-lg border border-emerald-500/10 bg-emerald-500/5 px-3 py-2">
                        <span className="mr-2 text-xs text-slate-600">
                          Replay:
                        </span>

                        <code className="break-all text-xs text-slate-300">
                          {formatValue(change.replay)}
                        </code>
                      </div>
                    ) : null}
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

function ResponsePanel({
  title,
  description,
  status,
  body,
}: {
  title: string;
  description: string;
  status: number | undefined;
  body: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/5 bg-black/20">
      <div className="border-b border-white/5 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-slate-300">{title}</div>

            <div className="mt-1 text-xs text-slate-600">{description}</div>
          </div>

          <span
            className={`rounded-md px-2 py-1 text-xs font-medium ${statusClass(
              status,
            )}`}
          >
            {status ?? "unknown"}
          </span>
        </div>
      </div>

      <pre className="max-h-96 overflow-auto p-4 text-sm leading-6 text-slate-300">
        {body}
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
