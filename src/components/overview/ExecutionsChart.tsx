"use client";

import { useState } from "react";

import type { HourBucket } from "@/lib/overview";

const HEIGHT = 120;
const GAP = 2;

function hourLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Executions per hour over 24 hours, stacked: failed (red) at the base,
 * succeeded above. Each column is its own hover and focus target.
 */
export function ExecutionsChart({ hours }: { hours: HourBucket[] }) {
  const [active, setActive] = useState<number | null>(null);

  const max = Math.max(1, ...hours.map((bucket) => bucket.total));

  const columnWidth = 100 / hours.length;

  const scale = (value: number) => (value / max) * (HEIGHT - 8);

  const current = active !== null ? hours[active] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-failure" />
          Failed
        </span>

        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-line-strong" />
          Succeeded
        </span>

        <span className="ml-auto font-mono tabular-nums">
          peak {max} / hour
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 100 ${HEIGHT}`}
          preserveAspectRatio="none"
          className="block h-32 w-full"
          role="img"
          aria-label="Executions per hour over the last 24 hours, failed and succeeded"
        >
          <line
            x1="0"
            x2="100"
            y1={HEIGHT}
            y2={HEIGHT}
            stroke="var(--line-strong)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />

          <line
            x1="0"
            x2="100"
            y1={HEIGHT - scale(max)}
            y2={HEIGHT - scale(max)}
            stroke="var(--line)"
            strokeWidth="1"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />

          {hours.map((bucket, index) => {
            const x = index * columnWidth;

            const failedHeight = scale(bucket.failed);

            const succeededHeight = scale(bucket.total - bucket.failed);

            const highlighted = active === index;

            return (
              <g key={bucket.hour}>
                {succeededHeight > 0 && (
                  <rect
                    x={x + columnWidth * 0.15}
                    width={columnWidth * 0.7}
                    y={HEIGHT - failedHeight - succeededHeight - (failedHeight > 0 ? GAP : 0)}
                    height={succeededHeight}
                    rx="0.6"
                    fill={highlighted ? "var(--muted)" : "var(--line-strong)"}
                  />
                )}

                {failedHeight > 0 && (
                  <rect
                    x={x + columnWidth * 0.15}
                    width={columnWidth * 0.7}
                    y={HEIGHT - failedHeight}
                    height={failedHeight}
                    rx="0.6"
                    fill="var(--failure)"
                    opacity={highlighted || active === null ? 1 : 0.7}
                  />
                )}

                {/* The whole column is the hit target, not just the bar. */}
                <rect
                  x={x}
                  width={columnWidth}
                  y="0"
                  height={HEIGHT}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${hourLabel(bucket.hour)}: ${bucket.total} executions, ${bucket.failed} failed`}
                  onPointerEnter={() => setActive(index)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  className="outline-none"
                />
              </g>
            );
          })}
        </svg>

        <div className="pointer-events-none flex justify-between font-mono text-xs tabular-nums text-faint">
          <span>{hourLabel(hours[0].hour)}</span>
          <span>{hourLabel(hours[12].hour)}</span>
          <span>now</span>
        </div>

        {current && active !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-line-strong bg-raised px-3 py-2 text-xs shadow-xl"
            style={{
              left: `${Math.min(Math.max((active + 0.5) * columnWidth, 12), 88)}%`,
            }}
          >
            <div className="font-mono text-muted">
              {hourLabel(current.hour)}
            </div>

            <div className="mt-1 flex items-center gap-2">
              <span className="h-0.5 w-3 bg-failure" />
              <span className="font-mono text-sm text-ink tabular-nums">
                {current.failed}
              </span>
              <span className="text-muted">failed</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="h-0.5 w-3 bg-line-strong" />
              <span className="font-mono text-sm text-ink tabular-nums">
                {current.total - current.failed}
              </span>
              <span className="text-muted">succeeded</span>
            </div>
          </div>
        )}
      </div>

      <table className="sr-only">
        <caption>Executions per hour</caption>
        <thead>
          <tr>
            <th>Hour</th>
            <th>Executions</th>
            <th>Failed</th>
          </tr>
        </thead>
        <tbody>
          {hours.map((bucket) => (
            <tr key={bucket.hour}>
              <td>{hourLabel(bucket.hour)}</td>
              <td>{bucket.total}</td>
              <td>{bucket.failed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
