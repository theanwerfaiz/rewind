import { Play } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, Panel } from "@/components/ui/primitives";
import { Badge, HttpStatus } from "@/components/ui/StatusBadge";
import { formatDateTime, formatRelative, shortId } from "@/lib/format";
import { describeMutation } from "@/lib/mutations";
import { getRecentExperiments } from "@/lib/replays";

export const metadata: Metadata = {
  title: "Replays",
};

export default async function ReplaysPage() {
  // Read at request time; otherwise the list is frozen at build time.
  await connection();

  const replays = getRecentExperiments(100);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Raw data" }, { label: "Replays" }]}
        title="Replays"
        description="Every replay and experiment Rewind has run, newest first."
        meta={<span>{replays.length === 100 ? "latest 100" : `${replays.length} replays`}</span>}
      />

      {replays.length === 0 ? (
        <EmptyState icon={<Play size={28} />} title="No replays yet">
          Open a captured request in the{" "}
          <Link href="/lab" className="text-accent">
            Replay Lab
          </Link>{" "}
          to replay it.
        </EmptyState>
      ) : (
        <Panel flush>
          <ul className="divide-y divide-line">
            {replays.map((replay) => (
              <li key={replay.id}>
                <Link
                  href={`/replays/${replay.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-raised"
                >
                  <HttpStatus status={replay.status} />

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ink">
                      {replay.label ??
                        (replay.mutations.length === 0
                          ? "Plain replay"
                          : "Unlabelled experiment")}
                      <span className="ml-2 text-muted">
                        {replay.eventTitle ?? `${replay.method} ${replay.url}`}
                      </span>
                    </div>

                    <div className="mt-0.5 truncate font-mono text-xs text-muted">
                      {shortId(replay.id, 12)}
                      {replay.mutations.length > 0 &&
                        ` · ${replay.mutations.map(describeMutation).join(" · ")}`}
                    </div>
                  </div>

                  {replay.dependencyMode && (
                    <Badge tone={replay.dependencyMode === "live" ? "warning" : "neutral"}>
                      deps {replay.dependencyMode}
                    </Badge>
                  )}

                  <span className="hidden w-14 shrink-0 text-right font-mono text-xs tabular-nums text-muted sm:block">
                    {replay.duration}
                  </span>

                  <span
                    title={formatDateTime(replay.createdAt)}
                    className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-muted"
                  >
                    {formatRelative(replay.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
