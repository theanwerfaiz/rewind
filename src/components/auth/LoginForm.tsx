"use client";

import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { buttonClass } from "@/components/ui/primitives";

/** Only same-site paths, so ?next= cannot send people to another site. */
function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();

  const [token, setToken] = useState("");

  const [error, setError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? `Sign-in failed (HTTP ${response.status}).`);
      }

      router.replace(safeNext(next));
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-2">
        <span className="block text-sm text-ink">Access token</span>

        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="current-password"
          autoFocus
          required
          className="h-10 w-full rounded-lg border border-line bg-canvas px-3 font-mono text-sm text-ink outline-none transition focus:border-accent"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-failure">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy || !token} className={`${buttonClass("primary")} w-full`}>
        <KeyRound size={14} />
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }}
      className={buttonClass("secondary")}
    >
      Sign out
    </button>
  );
}
