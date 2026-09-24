"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function VerifyButton() {
  const router = useRouter();

  const [running, setRunning] = useState(false);

  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setRunning(true);
    setError(null);

    try {
      const response = await fetch("/api/verifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          select: "failures",
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          Array.isArray(data?.errors)
            ? data.errors.join(" ")
            : `Verification failed with HTTP ${response.status}.`,
        );
      }

      router.refresh();
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "Verification failed.",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={verify}
        disabled={running}
        className="flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? "Verifying…" : "▶ Verify all recorded failures"}
      </button>

      {error && (
        <p className="max-w-sm text-right text-xs text-failure">{error}</p>
      )}
    </div>
  );
}
