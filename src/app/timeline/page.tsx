import Link from "next/link";
import { connection } from "next/server";
import db from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/primitives";

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

function getStatusClass(status: string) {
  switch (status) {
    case "success":
      return "bg-success";

    case "error":
      return "bg-failure";

    default:
      return "bg-faint";
  }
}

function getStatusTextClass(status: string) {
  switch (status) {
    case "success":
      return "text-success";

    case "error":
      return "text-failure";

    default:
      return "text-ink-2";
  }
}

async function getTimelineEvents(): Promise<TimelineEvent[]> {
  // better-sqlite3 is synchronous, so without this the query runs once at
  // build time and the page never shows newly captured events.
  await connection();

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
    <>
      <PageHeader
        crumbs={[{ label: "Raw data" }, { label: "Timeline" }]}
        title="Timeline"
        description="A chronological view of everything captured by Rewind. Related events are grouped by request."
      />

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Events" value={events.length} />
        <Stat label="Request stories" value={requestGroups} />
        <Stat
          label="Errors"
          value={errorCount}
          tone={errorCount > 0 ? "failure" : undefined}
        />
      </div>

        {groups.length === 0 ? (
          <div className="rounded-2xl border border-line bg-panel p-16 text-center">
            <div className="text-3xl text-faint">◷</div>

            <h2 className="mt-4 text-sm font-medium text-ink-2">
              No events yet
            </h2>

            <p className="mt-1 text-xs text-faint">
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
                  className="rounded-2xl border border-line bg-panel p-6"
                >
                  <div className="mb-6 flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-sm font-medium text-ink">
                          {hasRequest ? "Request Story" : "Standalone Event"}
                        </h2>

                        <span className="rounded-full bg-raised px-2.5 py-1 text-xs text-muted">
                          {group.events.length}{" "}
                          {group.events.length === 1 ? "event" : "events"}
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-faint">
                        {formatDate(firstEvent.timestamp)}
                      </p>
                    </div>

                    {firstEvent.request_id && (
                      <div className="max-w-full break-all rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-xs text-faint">
                        {firstEvent.request_id}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <div className="absolute bottom-4 left-[19px] top-4 w-px bg-hover" />

                    <div className="space-y-1">
                      {group.events.map((event) => (
                        <Link
                          key={event.id}
                          href={`/events/${event.id}`}
                          className="group relative flex gap-4 rounded-xl px-1 py-4 transition hover:bg-panel"
                        >
                          <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-panel font-mono text-sm text-ink-2 transition group-hover:border-line-strong group-hover:text-ink">
                            {getEventIcon(event.type)}
                          </div>

                          <div className="min-w-0 flex-1 pt-0.5">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-ink group-hover:text-ink">
                                  {event.title}
                                </div>

                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-faint">
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
                                <span className="font-mono text-xs text-faint">
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
                              className={`mt-2 text-xs uppercase tracking-wider ${getStatusTextClass(
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
      </>
  );
}
