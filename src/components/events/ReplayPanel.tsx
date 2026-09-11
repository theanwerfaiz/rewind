"use client";

import { useState } from "react";

type ReplayResult = {
  eventId: string;
  eventType?: string;
  url: string;
  method: string;
  status: number;
  statusText: string;
  duration: string;
  body: unknown;
  payload: unknown;
};

type ReplayResponse = {
  success: boolean;
  replay: ReplayResult;
};

type ReplayPanelProps = {
  eventId: string;
  eventType: string;
  payload?: unknown;
};

function formatPayload(payload: unknown) {
  if (payload === undefined || payload === null) {
    return "";
  }

  return JSON.stringify(payload, null, 2);
}

export function ReplayPanel({ eventId, eventType, payload }: ReplayPanelProps) {
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<ReplayResult | null>(null);

  const [payloadText, setPayloadText] = useState(() => formatPayload(payload));

  async function handleReplay() {
    setLoading(true);
    setError(null);
    setResult(null);

    let parsedPayload: unknown = undefined;

    if (payloadText.trim() !== "") {
      try {
        parsedPayload = JSON.parse(payloadText);
      } catch {
        setError("Payload must contain valid JSON.");

        setLoading(false);
        return;
      }
    }

    try {
      const response = await fetch("/api/replay", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          eventId,
          payload: parsedPayload,
        }),
      });

      let data: unknown;

      try {
        data = await response.json();
      } catch {
        throw new Error(`Replay failed with HTTP ${response.status}.`);
      }

      if (
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof data.error === "string"
      ) {
        throw new Error(data.error);
      }

      if (!response.ok) {
        throw new Error(`Replay failed with HTTP ${response.status}.`);
      }

      const replayResponse = data as ReplayResponse;

      if (!replayResponse.replay) {
        throw new Error("Replay response did not contain a result.");
      }

      setResult(replayResponse.replay);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Replay failed.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setPayloadText(formatPayload(payload));

    setError(null);
    setResult(null);
  }

  const replayable =
    eventType === "http.request" || eventType === "webhook.received";

  if (!replayable) {
    return null;
  }

  const isWebhook = eventType === "webhook.received";

  const resultIsSuccess =
    result !== null && result.status >= 200 && result.status < 300;

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium">
              {isWebhook ? "Replay Webhook" : "Replay"}
            </h2>

            {isWebhook && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-wider text-slate-500">
                Webhook
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-slate-500">
            {isWebhook
              ? "Edit the captured webhook payload and send it back to your local application."
              : "Edit the captured payload and replay this request against your local application."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={loading}
            className="flex h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-slate-300 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset
          </button>

          <button
            type="button"
            onClick={handleReplay}
            disabled={loading}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" />
                Replaying...
              </>
            ) : (
              <>
                <span>↻</span>
                {isWebhook ? "Replay Webhook" : "Replay Request"}
              </>
            )}
          </button>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-slate-500">
            {isWebhook ? "Webhook Payload" : "Request Payload"}
          </div>

          <div className="text-[11px] text-slate-600">JSON</div>
        </div>

        <textarea
          value={payloadText}
          onChange={(event) => setPayloadText(event.target.value)}
          spellCheck={false}
          className="min-h-52 w-full resize-y rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-sm leading-6 text-slate-300 outline-none transition placeholder:text-slate-700 focus:border-white/20"
          placeholder={`{
  "event": "example",
  "value": 123
}`}
        />

        <p className="mt-2 text-xs text-slate-600">
          Change the JSON above before replaying. The original captured event
          will not be modified.
        </p>
      </div>

      {error && (
        <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-red-400">
            Replay failed
          </div>

          <p className="mt-2 break-words text-sm text-red-300">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-5">
          <div
            className={`rounded-xl border p-4 ${
              resultIsSuccess
                ? "border-emerald-500/20 bg-emerald-500/5"
                : "border-red-500/20 bg-red-500/5"
            }`}
          >
            <div
              className={`text-xs font-medium uppercase tracking-wider ${
                resultIsSuccess ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {resultIsSuccess
                ? "Replay completed"
                : "Replay completed with error"}
            </div>

            <p className="mt-1 text-sm text-slate-400">
              The local application returned HTTP {result.status}.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <ResultCard
              label="Event Type"
              value={result.eventType ?? eventType}
            />

            <ResultCard label="Method" value={result.method} />

            <ResultCard
              label="Status"
              value={`${result.status} ${result.statusText}`}
            />

            <ResultCard label="Duration" value={result.duration} />
          </div>

          <div>
            <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">
              Response
            </div>

            <pre className="max-h-96 overflow-auto rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-slate-300">
              {JSON.stringify(result.body, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}

function ResultCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-600">
        {label}
      </div>

      <div className="mt-2 break-all font-mono text-sm text-slate-300">
        {value}
      </div>
    </div>
  );
}
