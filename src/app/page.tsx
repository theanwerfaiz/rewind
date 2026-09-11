import { Activity, Clock3, Webhook } from "lucide-react";

import { EventsExplorer } from "@/components/dashboard/EventsExplorer";
import { Header } from "@/components/dashboard/Header";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { StatCard } from "@/components/dashboard/StatCard";

import { getEventStats, getEvents } from "@/lib/events";

export default function Home() {
  const events = getEvents();
  const stats = getEventStats();

  const averageLatency =
    stats.averageLatency !== null ? `${stats.averageLatency}ms` : "—";

  return (
    <div className="flex min-h-screen bg-[#070b14]">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header />

        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-[1500px]">
            <div className="flex items-end justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">
                  Events
                </h1>

                <p className="mt-1 text-sm text-slate-500">
                  A unified view of everything happening in your application.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 text-xs text-slate-400 hover:bg-white/[0.05]">
                  Last 24 hours
                </button>

                <button className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 text-xs text-slate-400 hover:bg-white/[0.05]">
                  Filter
                </button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-4 gap-4">
              <StatCard
                label="Events"
                value={stats.total.toLocaleString()}
                description="Captured locally"
                type="events"
              />

              <StatCard
                label="Errors"
                value={stats.errors.toString()}
                description="Events requiring attention"
                type="errors"
              />

              <StatCard
                label="Webhooks"
                value={stats.webhooks.toString()}
                description="Captured webhook events"
                type="webhooks"
              />

              <StatCard
                label="Avg. latency"
                value={averageLatency}
                description="Across captured requests"
                type="latency"
              />
            </div>

            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-medium text-slate-200">
                    Recent events
                  </h2>

                  <p className="mt-1 text-xs text-slate-600">
                    Latest activity captured by Rewind.
                  </p>
                </div>

                <span className="text-[11px] text-slate-600">
                  {events.length} events
                </span>
              </div>

              {events.length > 0 ? (
                <EventsExplorer events={events} />
              ) : (
                <div className="rounded-xl border border-white/[0.07] bg-[#0d1320] p-12 text-center">
                  <Activity size={28} className="mx-auto text-slate-700" />

                  <h3 className="mt-4 text-sm font-medium text-slate-300">
                    No events yet
                  </h3>

                  <p className="mt-1 text-xs text-slate-600">
                    Capture your first event to start using Rewind.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-white/[0.07] bg-[#0d1320] p-5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                  <Activity size={17} />
                </div>

                <h3 className="text-sm font-medium text-slate-200">
                  Reproduce easily
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-slate-500">
                  Replay real events against your local environment.
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-[#0d1320] p-5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                  <Webhook size={17} />
                </div>

                <h3 className="text-sm font-medium text-slate-200">
                  Understand the full story
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-slate-500">
                  Connect requests, errors, webhooks and activity.
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-[#0d1320] p-5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Clock3 size={17} />
                </div>

                <h3 className="text-sm font-medium text-slate-200">
                  Prevent the next incident
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-slate-500">
                  Turn real production failures into repeatable tests.
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
