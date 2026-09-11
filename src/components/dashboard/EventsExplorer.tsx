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
        event.sessionId,
        event.userId,
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
      <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search events, types, sources, request IDs..."
              className="h-10 w-full rounded-lg border border-white/[0.08] bg-black/20 px-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-white/20"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={type}
              onChange={(event) =>
                setType(event.target.value as EventType | "all")
              }
              className="h-10 rounded-lg border border-white/[0.08] bg-[#0d1320] px-3 text-xs text-slate-400 outline-none focus:border-white/20"
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
                className="h-10 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 text-xs text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-600">
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
