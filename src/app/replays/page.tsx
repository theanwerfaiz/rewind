import Link from "next/link";
import { connection } from "next/server";

import db from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";

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
    return "bg-success-soft text-success";
  }

  if (status >= 400) {
    return "bg-failure-soft text-failure";
  }

  return "bg-hover text-ink-2";
}

export default async function ReplaysPage() {
  // Read at request time; otherwise the list is frozen at build time.
  await connection();

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
    <>
      <PageHeader
        crumbs={[{ label: "Raw data" }, { label: "Replays" }]}
        title="Replays"
        description="Every replay and experiment Rewind has run, newest first."
      />

        {rows.length === 0 ? (
          <section className="rounded-2xl border border-line bg-panel p-10 text-center">
            <h2 className="text-lg font-medium">No replays yet</h2>

            <p className="mt-2 text-sm text-muted">
              Replay an HTTP request or webhook to see its history here.
            </p>
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-line bg-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="border-b border-line bg-panel">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted">
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
                      className="transition hover:bg-panel"
                    >
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-ink-2">
                        <Link
                          href={`/replays/${replay.id}`}
                          className="transition hover:text-ink"
                        >
                          {formatDate(replay.timestamp)}
                        </Link>
                      </td>

                      <td className="px-5 py-4">
                        <Link href={`/replays/${replay.id}`}>
                          <span className="rounded-md border border-line bg-canvas px-2 py-1 font-mono text-xs text-ink-2">
                            {replay.method}
                          </span>
                        </Link>
                      </td>

                      <td className="max-w-md px-5 py-4">
                        <Link
                          href={`/replays/${replay.id}`}
                          className="block truncate font-mono text-sm text-ink-2 transition hover:text-ink"
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

                      <td className="px-5 py-4 font-mono text-sm text-ink-2">
                        <Link
                          href={`/replays/${replay.id}`}
                          className="transition hover:text-ink"
                        >
                          {replay.duration}
                        </Link>
                      </td>

                      <td className="px-5 py-4">
                        <Link
                          href={`/events/${replay.event_id}`}
                          className="font-mono text-xs text-ink-2 transition hover:text-ink"
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

        <div className="mt-4 text-xs text-faint">
          Showing {rows.length} replay
          {rows.length === 1 ? "" : "s"}.
        </div>
      </>
  );
}
