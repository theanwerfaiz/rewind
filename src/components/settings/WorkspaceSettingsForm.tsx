"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { buttonClass } from "@/components/ui/primitives";
import type { Settings } from "@/lib/settings";

function toList(text: string) {
  return text
    .split(/[\s,]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

const textareaClass =
  "min-h-20 w-full rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-sm text-ink outline-none transition placeholder:text-faint focus:border-accent";

export function WorkspaceSettingsForm({
  settings,
  builtInHeaders,
}: {
  settings: Settings;
  builtInHeaders: string[];
}) {
  const router = useRouter();

  const [headers, setHeaders] = useState(settings.extraRedactedHeaders.join("\n"));

  const [fields, setFields] = useState(settings.extraRedactedFields.join("\n"));

  const [mode, setMode] = useState(settings.defaultDependencyMode);

  const [state, setState] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function save(event: React.FormEvent) {
    event.preventDefault();

    setState({ kind: "saving" });

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extraRedactedHeaders: toList(headers),
          extraRedactedFields: toList(fields),
          defaultDependencyMode: mode,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.settings) {
        throw new Error(
          typeof data?.error === "string" ? data.error : `Saving failed with HTTP ${response.status}.`,
        );
      }

      const saved = data.settings as Settings;

      setHeaders(saved.extraRedactedHeaders.join("\n"));
      setFields(saved.extraRedactedFields.join("\n"));
      setMode(saved.defaultDependencyMode);
      setState({ kind: "saved" });

      router.refresh();
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Saving failed.",
      });
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <label className="block space-y-2">
          <span className="block text-sm text-ink">Extra headers to redact</span>

          <textarea
            value={headers}
            onChange={(event) => setHeaders(event.target.value)}
            placeholder={"x-tenant-secret\nx-internal-token"}
            spellCheck={false}
            className={textareaClass}
          />

          <span className="block text-xs text-muted">
            One per line. Always redacted, whatever is listed here:{" "}
            <span className="font-mono">{builtInHeaders.join(", ")}</span>.
          </span>
        </label>

        <label className="block space-y-2">
          <span className="block text-sm text-ink">Extra JSON fields to redact</span>

          <textarea
            value={fields}
            onChange={(event) => setFields(event.target.value)}
            placeholder={"ssn\ndateOfBirth"}
            spellCheck={false}
            className={textareaClass}
          />

          <span className="block text-xs text-muted">
            Matched by name at any depth in payloads and response bodies.
            Names that look like credentials (password, token, secret, api key…)
            are always redacted.
          </span>
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm text-ink">Default dependency mode for experiments</legend>

        <div className="flex flex-wrap gap-2">
          {(
            [
              {
                value: "recorded",
                label: "Recorded",
                detail: "Dependencies answer from the recording",
              },
              {
                value: "blocked",
                label: "Blocked",
                detail: "Outgoing calls fail, nothing is sent",
              },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                mode === option.value
                  ? "border-accent/60 bg-accent-soft"
                  : "border-line bg-canvas hover:border-line-strong"
              }`}
            >
              <input
                type="radio"
                name="defaultDependencyMode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
                className="mt-1 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-ink">{option.label}</span>
                <span className="block text-xs text-muted">{option.detail}</span>
              </span>
            </label>
          ))}
        </div>

        <p className="text-xs text-muted">
          Live mode is never the default: an experiment that re-sends payments
          or emails has to choose it explicitly.
        </p>
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={state.kind === "saving"}
          className={buttonClass("primary")}
        >
          {state.kind === "saving" ? "Saving…" : "Save settings"}
        </button>

        {state.kind === "saved" && (
          <span role="status" className="flex items-center gap-1.5 text-sm text-success">
            <Check size={14} />
            Saved. New events use these rules.
          </span>
        )}

        {state.kind === "error" && (
          <span role="alert" className="text-sm text-failure">
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
