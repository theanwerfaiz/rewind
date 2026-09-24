"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ImportState =
  | { kind: "idle" }
  | { kind: "importing"; name: string }
  | { kind: "imported"; executionId: string; warnings: number }
  | { kind: "failed"; errors: string[] };

export function CapsuleImporter() {
  const router = useRouter();

  const [state, setState] = useState<ImportState>({ kind: "idle" });

  async function importFile(file: File) {
    setState({
      kind: "importing",
      name: file.name,
    });

    try {
      const response = await fetch("/api/capsules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: await file.text(),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setState({
          kind: "failed",
          errors: Array.isArray(data?.errors)
            ? data.errors
            : [`Import failed with HTTP ${response.status}.`],
        });

        return;
      }

      setState({
        kind: "imported",
        executionId: data.executionId,
        warnings: Array.isArray(data.warnings) ? data.warnings.length : 0,
      });

      router.refresh();
    } catch (error) {
      setState({
        kind: "failed",
        errors: [error instanceof Error ? error.message : "Import failed."],
      });
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-[#0d1320] p-6">
      <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
        <span className="text-sm text-slate-200">
          Import a capsule (.rewind.json)
        </span>

        <span className="text-xs text-slate-500">
          Its structure and integrity digest are checked before anything is
          written.
        </span>

        <input
          type="file"
          accept=".json,application/json"
          aria-label="Capsule file"
          className="mt-3 text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-black"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              void importFile(file);
            }

            event.target.value = "";
          }}
        />
      </label>

      {state.kind === "importing" && (
        <p className="mt-4 text-center text-xs text-slate-500">
          Importing {state.name}…
        </p>
      )}

      {state.kind === "imported" && (
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">
          Imported.{" "}
          <Link
            href={`/executions/${state.executionId}`}
            className="underline underline-offset-4"
          >
            Open the execution →
          </Link>
          {state.warnings > 0 && (
            <span className="mt-1 block text-xs text-amber-200">
              The scan flagged {state.warnings} value
              {state.warnings === 1 ? "" : "s"} that may be personal data or
              secrets.
            </span>
          )}
        </div>
      )}

      {state.kind === "failed" && (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
          <div className="text-xs font-medium uppercase tracking-wider text-red-400">
            Import refused
          </div>

          <ul className="mt-2 list-disc space-y-1 pl-5">
            {state.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
