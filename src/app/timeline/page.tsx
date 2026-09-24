import Link from "next/link";
import { connection } from "next/server";
import db from "@/lib/db";
import { EventIcon } from "@/components/ui/EventIcon";
import { StatusDot } from "@/components/ui/StatusBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/primitives";
import type { Metadata } from "next";

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

export const metadata: Metadata = {
  title: "Timeline",
};

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
                  className="overflow-hidden rounded-xl border border-line bg-panel"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                    <div className="flex items-center gap-3">
                      <h2 className="text-sm font-medium text-ink">
                        {hasRequest ? "Request" : "Standalone event"}
                      </h2>

                      <span className="rounded-full bg-raised px-2 py-0.5 text-xs text-muted">
                        {group.events.length}{" "}
                        {group.events.length === 1 ? "event" : "events"}
                      </span>

                      <span className="text-xs text-faint">
                        {formatDate(firstEvent.timestamp)}
                      </span>
                    </div>

                    {firstEvent.request_id && (
                      <span className="max-w-full truncate font-mono text-xs text-faint">
                        {firstEvent.request_id}
                      </span>
                    )}
                  </div>

                  <ol className="divide-y divide-line">
                    {group.events.map((event) => (
                      <li key={event.id}>
                        <Link
                          href={`/events/${event.id}`}
                          className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-raised"
                        >
                          <EventIcon type={event.type} status={event.status} size="sm" />

                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm text-ink">
                              {event.title}
                            </div>

                            <div className="mt-0.5 truncate text-xs text-muted">
                              {event.type}
                              {event.source ? ` · ${event.source}` : ""}
                              {event.duration ? ` · ${event.duration}` : ""}
                            </div>
                          </div>

                          <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
                            {formatTime(event.timestamp)}
                          </span>

                          <StatusDot status={event.status} />
                        </Link>
                      </li>
                    ))}
                  </ol>
                </section>
              );
            })}
          </div>
        )}
      </>
  );
}
