"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { shortId } from "@/lib/format";

/**
 * A Rewind ID, shortened for display. The full ID shows on hover and is
 * copied on click.
 */
export function IdChip({ id, full = false }: { id: string; full?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable; the full ID is still in the title.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied" : `${id} (click to copy)`}
      aria-label={`Copy ${id}`}
      className="group inline-flex max-w-full items-center gap-1.5 rounded px-1 font-mono text-xs text-muted transition hover:bg-raised hover:text-ink"
    >
      <span className="truncate">{full ? id : shortId(id)}</span>

      {copied ? (
        <Check size={12} className="shrink-0 text-success" />
      ) : (
        <Copy
          size={12}
          className="shrink-0 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      )}
    </button>
  );
}
