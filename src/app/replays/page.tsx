import Link from "next/link";

import db from "@/lib/db";

type ReplayRow = {
  id: string;
  event_id: string;
  timestamp: string;
  method: string;
  url: string;
  status: number;
  duration: string;
  payload: string | null;
  created_at: string;
};

function formatDate(timestamp: string) {
  return new Date(timestamp).toLocaleString();
}

function statusClass(status: number) {
  if (status >= 200 && status < 300) {
    return "bg-emerald-500/10 text-emerald-400";
  }

  if (status >= 400) {
    return "bg-red-500/10 text-red-400";
  }

  return "bg-white/10 text-slate-400";
}

export default function ReplaysPage() {
  const rows = db
    .prepare(
      `
      SELECT
        id,
        event_id,
        timestamp,
        method,
        url,
        status,
        duration,
        payload,
        created_at
      FROM replays
      ORDER BY created_at DESC
      LIMIT 100
      `,
    )
    .all() as ReplayRow[];

  return (
    <main className="min-h-screen bg-[#08090b] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-slate-400 transition hover:text-white"
          >
            ← Back to events
          </Link>

          <div className="mt-5">
            <h1 className="text-3xl font-semibold tracking-tight">
              Replay History
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Every replay attempt recorded by Rewind.
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center">
            <h2 className="text-lg font-medium">No replays yet</h2>

            <p className="mt-2 text-sm text-slate-500">
              Replay an HTTP request or webhook to see its history here.
            </p>
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="border-b border-white/10 bg-white/[0.02]">
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-4">Time</th>

                    <th className="px-5 py-4">Method</th>

                    <th className="px-5 py-4">URL</th>

                    <th className="px-5 py-4">Status</th>

                    <th className="px-5 py-4">Duration</th>

                    <th className="px-5 py-4">Original Event</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/5">
                  {rows.map((replay) => (
                    <tr
                      key={replay.id}
                      className="transition hover:bg-white/[0.03]"
                    >
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-400">
                        <Link
                          href={`/replays/${replay.id}`}
                          className="transition hover:text-white"
                        >
                          {formatDate(replay.timestamp)}
                        </Link>
                      </td>

                      <td className="px-5 py-4">
                        <Link href={`/replays/${replay.id}`}>
                          <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 font-mono text-xs text-slate-300">
                            {replay.method}
                          </span>
                        </Link>
                      </td>

                      <td className="max-w-md px-5 py-4">
                        <Link
                          href={`/replays/${replay.id}`}
                          className="block truncate font-mono text-sm text-slate-300 transition hover:text-white"
                        >
                          {replay.url}
                        </Link>
                      </td>

                      <td className="px-5 py-4">
                        <Link href={`/replays/${replay.id}`}>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                              replay.status,
                            )}`}
                          >
                            {replay.status}
                          </span>
                        </Link>
                      </td>

                      <td className="px-5 py-4 font-mono text-sm text-slate-400">
                        <Link
                          href={`/replays/${replay.id}`}
                          className="transition hover:text-white"
                        >
                          {replay.duration}
                        </Link>
                      </td>

                      <td className="px-5 py-4">
                        <Link
                          href={`/events/${replay.event_id}`}
                          className="font-mono text-xs text-slate-400 transition hover:text-white"
                        >
                          {replay.event_id}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="mt-4 text-xs text-slate-600">
          Showing {rows.length} replay
          {rows.length === 1 ? "" : "s"}.
        </div>
      </div>
    </main>
  );
}
