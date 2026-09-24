import Link from "next/link";

import { EventIcon } from "@/components/ui/EventIcon";
import { StatusDot } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/format";
import type { RewindEvent } from "@/lib/mock-events";

type EventTableProps = {
  events: RewindEvent[];
};

export function EventTable({ events }: EventTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel">
      {events.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-muted">
          No events match these filters.
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/events/${event.id}`}
                className="flex items-center gap-3 px-4 py-3 transition hover:bg-raised"
              >
                <EventIcon type={event.type} status={event.status} />

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">{event.title}</div>

                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span className="font-mono">{event.type}</span>

                    {event.source && <span>· {event.source}</span>}

                    {event.duration && (
                      <span className="font-mono tabular-nums">
                        · {event.duration}
                      </span>
                    )}
                  </div>
                </div>

                <span className="hidden shrink-0 font-mono text-xs tabular-nums text-muted sm:block">
                  {formatDateTime(event.timestamp)}
                </span>

                <StatusDot status={event.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
