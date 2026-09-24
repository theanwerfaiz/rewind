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
    return "bg-hover text-ink-2";
  }

  if (status >= 200 && status < 300) {
    return "bg-success-soft text-success";
  }

  if (status >= 400) {
    return "bg-failure-soft text-failure";
  }

  return "bg-warning-soft text-warning";
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
    <section className="mt-6 rounded-2xl border border-line bg-panel p-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-medium">Response Comparison</h2>

          <p className="mt-1 text-sm text-muted">
            Compare the original application response with the replay response.
          </p>
        </div>

        <div
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            hasChanges
              ? "bg-warning-soft text-warning"
              : "bg-success-soft text-success"
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
              ? "border-line-strong bg-hover text-ink"
              : "border-line bg-canvas text-muted hover:text-ink"
          }`}
        >
          Side by side
        </button>

        <button
          type="button"
          onClick={() => setView("json")}
          className={`rounded-lg border px-3 py-2 text-sm transition ${
            view === "json"
              ? "border-line-strong bg-hover text-ink"
              : "border-line bg-canvas text-muted hover:text-ink"
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
            <h3 className="text-sm font-medium text-ink-2">
              Response Changes
            </h3>

            <p className="mt-1 text-xs text-faint">
              Differences between the original and replay responses.
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-line">
            <div className="divide-y divide-white/5">
              {statusChanged ? (
                <div className="bg-canvas px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-mono text-sm text-ink-2">
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

                        <span className="text-faint">→</span>

                        <span
                          className={`rounded-md px-2 py-1 text-xs font-medium ${statusClass(
                            replayStatus,
                          )}`}
                        >
                          {replayStatus}
                        </span>
                      </div>
                    </div>

                    <span className="self-start rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">
                      Changed
                    </span>
                  </div>
                </div>
              ) : null}

              {bodyChanges.map((change, index) => (
                <div
                  key={`${change.path}-${index}`}
                  className="bg-canvas px-4 py-4"
                >
                  <div className="font-mono text-sm text-ink-2">
                    {change.path}
                  </div>

                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                    {change.original !== undefined ? (
                      <div className="rounded-lg border border-failure/10 bg-failure-soft px-3 py-2">
                        <span className="mr-2 text-xs text-faint">
                          Original:
                        </span>

                        <code className="break-all text-xs text-ink-2">
                          {formatValue(change.original)}
                        </code>
                      </div>
                    ) : null}

                    <span className="text-faint">→</span>

                    {change.replay !== undefined ? (
                      <div className="rounded-lg border border-success/10 bg-success-soft px-3 py-2">
                        <span className="mr-2 text-xs text-faint">
                          Replay:
                        </span>

                        <code className="break-all text-xs text-ink-2">
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
    <div className="overflow-hidden rounded-xl border border-line bg-canvas">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-ink-2">{title}</div>

            <div className="mt-1 text-xs text-faint">{description}</div>
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

      <pre className="max-h-96 overflow-auto p-4 text-sm leading-6 text-ink-2">
        {body}
      </pre>
    </div>
  );
}

function JsonColumn({ title, value }: { title: string; value: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-canvas">
      <div className="border-b border-line px-4 py-3 text-sm font-medium text-ink-2">
        {title}
      </div>

      <pre className="max-h-96 overflow-auto p-4 text-sm leading-6 text-ink-2">
        {value}
      </pre>
    </div>
  );
}
