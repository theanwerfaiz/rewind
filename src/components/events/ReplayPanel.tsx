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
    <section className="mt-6 rounded-2xl border border-line bg-panel p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium">
              {isWebhook ? "Replay Webhook" : "Replay"}
            </h2>

            {isWebhook && (
              <span className="rounded-full border border-line bg-raised px-2.5 py-1 text-xs uppercase tracking-wider text-muted">
                Webhook
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-muted">
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
            className="flex h-10 items-center justify-center rounded-lg border border-line bg-panel px-4 text-sm font-medium text-ink-2 transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset
          </button>

          <button
            type="button"
            onClick={handleReplay}
            disabled={loading}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
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
          <div className="text-xs uppercase tracking-wider text-muted">
            {isWebhook ? "Webhook Payload" : "Request Payload"}
          </div>

          <div className="text-xs text-faint">JSON</div>
        </div>

        <textarea
          value={payloadText}
          onChange={(event) => setPayloadText(event.target.value)}
          spellCheck={false}
          className="min-h-52 w-full resize-y rounded-xl border border-line bg-canvas p-4 font-mono text-sm leading-6 text-ink-2 outline-none transition placeholder:text-faint focus:border-line-strong"
          placeholder={`{
  "event": "example",
  "value": 123
}`}
        />

        <p className="mt-2 text-xs text-faint">
          Change the JSON above before replaying. The original captured event
          will not be modified.
        </p>
      </div>

      {error && (
        <div className="mt-5 rounded-xl border border-failure/20 bg-failure-soft p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-failure">
            Replay failed
          </div>

          <p className="mt-2 break-words text-sm text-failure">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-5">
          <div
            className={`rounded-xl border p-4 ${
              resultIsSuccess
                ? "border-success/20 bg-success-soft"
                : "border-failure/20 bg-failure-soft"
            }`}
          >
            <div
              className={`text-xs font-medium uppercase tracking-wider ${
                resultIsSuccess ? "text-success" : "text-failure"
              }`}
            >
              {resultIsSuccess
                ? "Replay completed"
                : "Replay completed with error"}
            </div>

            <p className="mt-1 text-sm text-ink-2">
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
            <div className="mb-2 text-xs uppercase tracking-wider text-muted">
              Response
            </div>

            <pre className="max-h-96 overflow-auto rounded-xl border border-line bg-canvas p-4 text-sm leading-6 text-ink-2">
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
    <div className="rounded-xl border border-line bg-canvas p-4">
      <div className="text-xs uppercase tracking-wider text-faint">
        {label}
      </div>

      <div className="mt-2 break-all font-mono text-sm text-ink-2">
        {value}
      </div>
    </div>
  );
}
