"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { buttonClass } from "@/components/ui/primitives";

export function NewIncidentForm() {
  const router = useRouter();

  const [title, setTitle] = useState("");

  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.incident) {
        throw new Error(data?.error ?? `HTTP ${response.status}`);
      }

      router.push(`/incidents/${data.incident.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create the incident.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-6 flex flex-wrap gap-2">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="New incident, e.g. Checkout returns 502 when payments time out"
        aria-label="Incident title"
        maxLength={200}
        className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 text-sm text-ink outline-none transition placeholder:text-faint focus:border-accent"
      />

      <button
        type="submit"
        disabled={saving || title.trim() === ""}
        className={`${buttonClass("primary")} h-10`}
      >
        <Plus size={14} />
        Open incident
      </button>

      {error && (
        <p role="alert" className="w-full text-sm text-failure">
          {error}
        </p>
      )}
    </form>
  );
}
