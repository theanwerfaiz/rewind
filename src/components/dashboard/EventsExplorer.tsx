"use client";

import { useMemo, useState } from "react";

import type { EventType, RewindEvent } from "@/lib/mock-events";

import { EventTable } from "@/components/dashboard/EventTable";

type EventsExplorerProps = {
  events: RewindEvent[];
};

const EVENT_TYPES: EventType[] = [
  "webhook.received",
  "http.request",
  "http.dependency",
  "error",
  "database.query",
  "agent.action",
  "command",
  "deployment",
  "config.change",
];

export function EventsExplorer({ events }: EventsExplorerProps) {
  const [search, setSearch] = useState("");

  const [type, setType] = useState<EventType | "all">("all");

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return events.filter((event) => {
      if (type !== "all" && event.type !== type) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [
        event.title,
        event.type,
        event.source,
        event.requestId,
        event.traceId,
        event.spanId,
        event.sessionId,
        event.userId,
        event.executionId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [events, search, type]);

  const hasFilters = search.trim().length > 0 || type !== "all";

  function clearFilters() {
    setSearch("");
    setType("all");
  }

  return (
    <div>
      <div className="mb-4 rounded-xl border border-line bg-panel p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search events, types, sources, request IDs..."
              className="h-9 w-full rounded-lg border border-line bg-canvas px-3 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
              aria-label="Search events"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={type}
              onChange={(event) =>
                setType(event.target.value as EventType | "all")
              }
              className="h-9 rounded-lg border border-line bg-canvas px-3 text-sm text-ink-2 outline-none focus:border-accent"
              aria-label="Event type"
            >
              <option value="all">All event types</option>

              {EVENT_TYPES.map((eventType) => (
                <option key={eventType} value={eventType}>
                  {eventType}
                </option>
              ))}
            </select>

            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="h-9 rounded-lg border border-line bg-raised px-3 text-sm text-ink-2 transition hover:bg-hover hover:text-ink"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between px-1 text-xs text-muted">
          <span>
            {filteredEvents.length} of {events.length} events
          </span>

          {hasFilters && <span>Filters active</span>}
        </div>
      </div>

      <EventTable events={filteredEvents} />
    </div>
  );
}
