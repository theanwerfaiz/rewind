import { List } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";

import { EventsExplorer } from "@/components/dashboard/EventsExplorer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, Stat } from "@/components/ui/primitives";
import { getEventStats, getEvents } from "@/lib/events";

export const metadata: Metadata = {
  title: "Events",
};

export default async function EventsPage() {
  // Read at request time: better-sqlite3 is synchronous, so without this
  // the page would be prerendered with build-time data.
  await connection();

  const events = getEvents();

  const stats = getEventStats();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Raw data" }, { label: "Events" }]}
        title="Events"
        description="Every event Rewind has captured, newest first. For requests and what they caused, start from Executions."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Events" value={stats.total.toLocaleString()} />
        <Stat
          label="Errors"
          value={stats.errors.toLocaleString()}
          tone={stats.errors > 0 ? "failure" : undefined}
        />
        <Stat label="Webhooks" value={stats.webhooks.toLocaleString()} />
        <Stat
          label="Avg. latency"
          value={
            stats.averageLatency !== null ? `${stats.averageLatency}ms` : "—"
          }
        />
      </div>

      {events.length > 0 ? (
        <EventsExplorer events={events} />
      ) : (
        <EmptyState icon={<List size={28} />} title="No events yet">
          Wrap a route handler with <code>withRewindCapture</code> and send it
          a request; the event appears here.
        </EmptyState>
      )}
    </>
  );
}
