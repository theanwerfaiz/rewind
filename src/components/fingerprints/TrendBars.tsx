"use client";

import { useState } from "react";

import type { DayBucket } from "@/lib/fingerprint-history";

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Occurrences per day: one series, so no legend; the panel title names it. */
export function TrendBars({ days }: { days: DayBucket[] }) {
  const [active, setActive] = useState<number | null>(null);

  const max = Math.max(1, ...days.map((bucket) => bucket.count));

  const current = active !== null ? days[active] : null;

  return (
    <div>
      <div className="relative">
        <div
          role="img"
          aria-label={`Occurrences per day over ${days.length} days`}
          className="flex h-24 items-end gap-1"
        >
          {days.map((bucket, index) => (
            <div
              key={bucket.day}
              tabIndex={0}
              aria-label={`${dayLabel(bucket.day)}: ${bucket.count}`}
              onPointerEnter={() => setActive(index)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              className="flex h-full flex-1 items-end rounded-sm outline-none"
            >
              <div
                className={`w-full rounded-t-[3px] ${
                  bucket.count === 0
                    ? "h-px bg-line-strong"
                    : active === index
                      ? "bg-failure"
                      : "bg-failure/75"
                }`}
                style={
                  bucket.count > 0
                    ? { height: `${Math.max((bucket.count / max) * 100, 6)}%` }
                    : undefined
                }
              />
            </div>
          ))}
        </div>

        {current && active !== null && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line-strong bg-raised px-2.5 py-1.5 text-xs shadow-xl"
            style={{
              left: `${Math.min(Math.max(((active + 0.5) / days.length) * 100, 10), 90)}%`,
            }}
          >
            <span className="font-mono tabular-nums text-ink">{current.count}</span>{" "}
            <span className="text-muted">on {dayLabel(current.day)}</span>
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between font-mono text-xs text-faint">
        <span>{dayLabel(days[0].day)}</span>
        <span>today</span>
      </div>

      <table className="sr-only">
        <caption>Occurrences per day</caption>
        <tbody>
          {days.map((bucket) => (
            <tr key={bucket.day}>
              <td>{dayLabel(bucket.day)}</td>
              <td>{bucket.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
