import Link from "next/link";
import type { RewindEvent } from "@/lib/mock-events";

type EventTableProps = {
  events: RewindEvent[];
};

function getEventIcon(type: RewindEvent["type"]) {
  switch (type) {
    case "webhook.received":
      return "↗";

    case "http.request":
      return "→";

    case "http.dependency":
      return "⇄";

    case "error":
      return "!";

    case "database.query":
      return "◇";

    case "agent.action":
      return "✦";

    case "command":
      return "$";

    case "deployment":
      return "▲";

    case "config.change":
      return "⚙";

    default:
      return "•";
  }
}

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function EventTable({ events }: EventTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="border-b border-white/10 px-6 py-4">
        <h2 className="text-lg font-medium">Recent Events</h2>

        <p className="mt-1 text-sm text-slate-500">
          Latest events captured by Rewind
        </p>
      </div>

      <div className="divide-y divide-white/5">
        {events.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            No events captured yet.
          </div>
        ) : (
          events.map((event) => (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              className="flex items-center gap-4 px-6 py-4 transition hover:bg-white/[0.04]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] font-mono text-sm text-slate-300">
                {getEventIcon(event.type)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-200">
                  {event.title}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{event.type}</span>

                  {event.source && (
                    <>
                      <span>•</span>
                      <span>{event.source}</span>
                    </>
                  )}

                  {event.duration && (
                    <>
                      <span>•</span>
                      <span>{event.duration}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="hidden text-xs text-slate-500 sm:block">
                {formatTime(event.timestamp)}
              </div>

              <div
                className={`h-2 w-2 rounded-full ${
                  event.status === "success"
                    ? "bg-emerald-400"
                    : event.status === "error"
                      ? "bg-red-400"
                      : "bg-slate-500"
                }`}
              />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
