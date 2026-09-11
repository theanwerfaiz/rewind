import Link from "next/link";
import db from "@/lib/db";

type TimelineEvent = {
  id: string;
  timestamp: string;
  type: string;
  title: string;
  status: string;
  duration: string | null;
  source: string | null;
  request_id: string | null;
  user_id: string | null;
};

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(timestamp: string) {
  return new Date(timestamp).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getEventIcon(type: string) {
  switch (type) {
    case "webhook.received":
      return "↗";

    case "http.request":
      return "→";

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

function getStatusClass(status: string) {
  switch (status) {
    case "success":
      return "bg-emerald-400";

    case "error":
      return "bg-red-400";

    default:
      return "bg-slate-500";
  }
}

function getStatusTextClass(status: string) {
  switch (status) {
    case "success":
      return "text-emerald-400";

    case "error":
      return "text-red-400";

    default:
      return "text-slate-400";
  }
}

async function getTimelineEvents(): Promise<TimelineEvent[]> {
  const rows = db
    .prepare(
      `
      SELECT
        id,
        timestamp,
        type,
        title,
        status,
        duration,
        source,
        request_id,
        user_id
      FROM events
      ORDER BY timestamp ASC
      `,
    )
    .all() as TimelineEvent[];

  return rows;
}

function groupEvents(events: TimelineEvent[]) {
  const groups = new Map<string, TimelineEvent[]>();

  for (const event of events) {
    const key = event.request_id ?? `event:${event.id}`;

    const existing = groups.get(key) ?? [];

    existing.push(event);

    groups.set(key, existing);
  }

  return Array.from(groups.entries()).map(([key, events]) => ({
    key,
    events,
  }));
}

export default async function TimelinePage() {
  const events = await getTimelineEvents();
  const groups = groupEvents(events);

  const errorCount = events.filter((event) => event.status === "error").length;

  const requestGroups = groups.filter((group) =>
    group.events.some((event) => event.request_id),
  ).length;

  return (
    <main className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-slate-500 transition hover:text-slate-200"
          >
            ← Back to events
          </Link>

          <div className="mt-5">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">
                Timeline
              </h1>

              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-500">
                {events.length} events
              </span>
            </div>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              A chronological view of everything captured by Rewind. Related
              events are grouped by request.
            </p>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/[0.07] bg-[#0d1320] p-5">
            <div className="text-xs uppercase tracking-wider text-slate-600">
              Total Events
            </div>

            <div className="mt-2 text-2xl font-semibold text-white">
              {events.length}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-[#0d1320] p-5">
            <div className="text-xs uppercase tracking-wider text-slate-600">
              Request Stories
            </div>

            <div className="mt-2 text-2xl font-semibold text-white">
              {requestGroups}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-[#0d1320] p-5">
            <div className="text-xs uppercase tracking-wider text-slate-600">
              Errors
            </div>

            <div className="mt-2 text-2xl font-semibold text-red-400">
              {errorCount}
            </div>
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.07] bg-[#0d1320] p-16 text-center">
            <div className="text-3xl text-slate-700">◷</div>

            <h2 className="mt-4 text-sm font-medium text-slate-300">
              No events yet
            </h2>

            <p className="mt-1 text-xs text-slate-600">
              Capture events to build your first timeline.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => {
              const firstEvent = group.events[0];
              const hasRequest = group.events.some((event) => event.request_id);

              return (
                <section
                  key={group.key}
                  className="rounded-2xl border border-white/[0.07] bg-[#0d1320] p-6"
                >
                  <div className="mb-6 flex flex-col gap-3 border-b border-white/[0.06] pb-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-sm font-medium text-slate-200">
                          {hasRequest ? "Request Story" : "Standalone Event"}
                        </h2>

                        <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[10px] text-slate-500">
                          {group.events.length}{" "}
                          {group.events.length === 1 ? "event" : "events"}
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-slate-600">
                        {formatDate(firstEvent.timestamp)}
                      </p>
                    </div>

                    {firstEvent.request_id && (
                      <div className="max-w-full break-all rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 font-mono text-[11px] text-slate-600">
                        {firstEvent.request_id}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <div className="absolute bottom-4 left-[19px] top-4 w-px bg-white/[0.08]" />

                    <div className="space-y-1">
                      {group.events.map((event) => (
                        <Link
                          key={event.id}
                          href={`/events/${event.id}`}
                          className="group relative flex gap-4 rounded-xl px-1 py-4 transition hover:bg-white/[0.03]"
                        >
                          <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-[#0d1320] font-mono text-sm text-slate-400 transition group-hover:border-white/[0.15] group-hover:text-white">
                            {getEventIcon(event.type)}
                          </div>

                          <div className="min-w-0 flex-1 pt-0.5">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-slate-200 group-hover:text-white">
                                  {event.title}
                                </div>

                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
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

                              <div className="flex shrink-0 items-center gap-3">
                                <span className="font-mono text-xs text-slate-600">
                                  {formatTime(event.timestamp)}
                                </span>

                                <span
                                  className={`h-2 w-2 rounded-full ${getStatusClass(
                                    event.status,
                                  )}`}
                                />
                              </div>
                            </div>

                            <div
                              className={`mt-2 text-[10px] uppercase tracking-wider ${getStatusTextClass(
                                event.status,
                              )}`}
                            >
                              {event.status}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
