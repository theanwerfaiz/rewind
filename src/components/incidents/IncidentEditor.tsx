"use client";

import { Check, CircleCheck, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { buttonClass } from "@/components/ui/primitives";
import type { IncidentStatus } from "@/lib/incidents";

async function patch(id: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/incidents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? `HTTP ${response.status}`);
  }
}

/** Resolve or reopen: the page header's primary action. */
export function IncidentStatusButton({
  id,
  status,
}: {
  id: string;
  status: IncidentStatus;
}) {
  const router = useRouter();

  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);

        try {
          await patch(id, { status: status === "open" ? "resolved" : "open" });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className={buttonClass(status === "open" ? "primary" : "secondary")}
    >
      {status === "open" ? <CircleCheck size={14} /> : <RotateCcw size={14} />}
      {status === "open" ? "Mark resolved" : "Reopen"}
    </button>
  );
}

export function IncidentNotes({ id, notes }: { id: string; notes: string }) {
  const [draft, setDraft] = useState(notes);

  const [saved, setSaved] = useState(notes);

  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const dirty = draft !== saved;

  return (
    <div className="space-y-2">
      <textarea
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setState("idle");
        }}
        placeholder="What happened, what you tried, what fixed it. Markdown is kept as plain text."
        aria-label="Incident notes"
        maxLength={20_000}
        className="min-h-40 w-full rounded-lg border border-line bg-canvas p-3 text-sm leading-6 text-ink outline-none transition placeholder:text-faint focus:border-accent"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!dirty || state === "saving"}
          onClick={async () => {
            setState("saving");

            try {
              await patch(id, { notes: draft });
              setSaved(draft);
              setState("saved");
            } catch {
              setState("error");
            }
          }}
          className={buttonClass("secondary")}
        >
          {state === "saving" ? "Saving…" : "Save notes"}
        </button>

        {state === "saved" && !dirty && (
          <span role="status" className="flex items-center gap-1.5 text-xs text-success">
            <Check size={13} />
            Saved
          </span>
        )}

        {state === "error" && (
          <span role="alert" className="text-xs text-failure">
            Could not save the notes.
          </span>
        )}
      </div>
    </div>
  );
}

export function UnlinkExecutionButton({
  incidentId,
  executionId,
}: {
  incidentId: string;
  executionId: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        await fetch(`/api/incidents/${incidentId}/executions`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ executionId }),
        });

        router.refresh();
      }}
      className="shrink-0 rounded-md px-2 py-1 text-xs text-muted transition hover:bg-hover hover:text-ink"
    >
      Remove
    </button>
  );
}
