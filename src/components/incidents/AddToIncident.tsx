"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Siren, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { buttonClass } from "@/components/ui/primitives";

type IncidentOption = {
  id: string;
  title: string;
  executionCount: number;
};

/**
 * Links this execution to an open incident, or opens a new one named after
 * it. The execution page passes the open incidents it is not yet part of.
 */
export function AddToIncident({
  executionId,
  suggestedTitle,
  openIncidents,
}: {
  executionId: string;
  suggestedTitle: string;
  openIncidents: IncidentOption[];
}) {
  const router = useRouter();

  const [open, setOpen] = useState(false);

  const [title, setTitle] = useState(suggestedTitle);

  const [error, setError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);

  async function run(request: () => Promise<Response>, goTo?: (data: { incident: { id: string } }) => string) {
    setBusy(true);
    setError(null);

    try {
      const response = await request();

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.incident) {
        throw new Error(data?.error ?? `HTTP ${response.status}`);
      }

      setOpen(false);

      if (goTo) {
        router.push(goTo(data));
      } else {
        router.refresh();
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={buttonClass("ghost")}>
        <Siren size={14} />
        Incident
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />

        <Dialog.Content className="fixed left-1/2 top-[14vh] z-50 w-[min(480px,calc(100vw-32px))] -translate-x-1/2 rounded-xl border border-line-strong bg-panel shadow-2xl outline-none">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <Dialog.Title className="text-sm font-medium text-ink">
                Add to an incident
              </Dialog.Title>

              <Dialog.Description className="mt-0.5 text-xs text-muted">
                Group the executions behind one problem, with notes and a status.
              </Dialog.Description>
            </div>

            <Dialog.Close
              aria-label="Close"
              className="rounded-md p-1 text-muted hover:bg-raised hover:text-ink"
            >
              <X size={15} />
            </Dialog.Close>
          </div>

          <div className="space-y-5 p-5">
            {openIncidents.length > 0 && (
              <div>
                <div className="mb-2 text-xs text-faint">Open incidents</div>

                <ul className="space-y-1">
                  {openIncidents.map((incident) => (
                    <li key={incident.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            fetch(`/api/incidents/${incident.id}/executions`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ executionId }),
                            }),
                          )
                        }
                        className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2 text-left text-sm transition hover:border-line-strong hover:bg-raised"
                      >
                        <span className="min-w-0 flex-1 truncate text-ink">{incident.title}</span>
                        <span className="shrink-0 font-mono text-xs text-muted">
                          {incident.executionCount} exe
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <form
              onSubmit={(event) => {
                event.preventDefault();

                run(
                  () =>
                    fetch("/api/incidents", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ title, executionId }),
                    }),
                  (data) => `/incidents/${data.incident.id}`,
                );
              }}
              className="space-y-2"
            >
              <label className="block text-xs text-faint" htmlFor="incident-title">
                Or open a new one
              </label>

              <div className="flex gap-2">
                <input
                  id="incident-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={200}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 text-sm text-ink outline-none focus:border-accent"
                />

                <button
                  type="submit"
                  disabled={busy || title.trim() === ""}
                  className={buttonClass("primary")}
                >
                  Open
                </button>
              </div>
            </form>

            {error && (
              <p role="alert" className="text-sm text-failure">
                {error}
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
