import { GitBranch, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { FilterBar } from "@/components/executions/FilterBar";
import { EventIcon } from "@/components/ui/EventIcon";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, Panel } from "@/components/ui/primitives";
import { Badge, StatusDot } from "@/components/ui/StatusBadge";
import {
  matchesExecutionFilter,
  parseExecutionFilter,
} from "@/lib/execution-filter";
import { getExecutions } from "@/lib/executions";
import { formatDateTime, formatRelative, formatSpan, shortId } from "@/lib/format";

export const metadata: Metadata = {
  title: "Executions",
};

const PAGE_SIZE = 200;

export default async function ExecutionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  await connection();

  const { q } = await searchParams;

  const query = typeof q === "string" ? q.trim() : "";

  const executions = getExecutions(query ? 2000 : PAGE_SIZE);

  const filter = parseExecutionFilter(query);

  const matched = executions.filter((execution) =>
    matchesExecutionFilter(execution, filter),
  );

  const shown = matched.slice(0, PAGE_SIZE);

  // Replays and experiments are not real failures.
  const failed = executions.filter(
    (execution) => execution.status === "error" && !execution.isReplay,
  ).length;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Monitor" }, { label: "Executions" }]}
        title="Executions"
        description="Each execution is one request or webhook and every event it caused. Open one to see its execution graph."
        meta={
          failed > 0 && !query ? (
            <Link
              href="/executions?q=is%3Afailed"
              className="text-failure hover:brightness-125"
            >
              {failed} failed
            </Link>
          ) : undefined
        }
      />

      {executions.length === 0 ? (
        <EmptyState icon={<GitBranch size={28} />} title="No executions yet">
          Capture your first request to create an execution you can replay and
          turn into a test.
        </EmptyState>
      ) : (
        <>
          <FilterBar
            key={query}
            query={query}
            errors={filter.errors}
            matched={matched.length}
            total={executions.length}
          />

          {shown.length === 0 ? (
            <EmptyState icon={<SearchX size={28} />} title="No executions match">
              Try a wider filter, for example{" "}
              <code className="font-mono">since:7d</code> instead of{" "}
              <code className="font-mono">since:1h</code>.
            </EmptyState>
          ) : (
            <Panel flush>
              <ul className="divide-y divide-line">
                {shown.map((execution) => (
                  <li key={execution.id}>
                    <Link
                      href={`/executions/${execution.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition hover:bg-raised"
                    >
                      <EventIcon
                        type={execution.rootType ?? "http.request"}
                        status={execution.status}
                        size="sm"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm text-ink">
                            {execution.rootTitle ?? "Untitled execution"}
                          </span>

                          {execution.isReplay && <Badge tone="accent">replay</Badge>}

                          {execution.capsuleId && <Badge tone="accent">imported</Badge>}
                        </div>

                        <div className="mt-0.5 truncate font-mono text-xs text-muted">
                          {shortId(execution.id)}
                          {execution.environment ? ` · ${execution.environment}` : ""}
                          {execution.fingerprintId ? ` · ${shortId(execution.fingerprintId)}` : ""}
                        </div>
                      </div>

                      <span className="hidden shrink-0 font-mono text-xs tabular-nums text-muted sm:block">
                        {execution.eventCount} ev
                      </span>

                      <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-muted">
                        {formatSpan(execution.startedAt, execution.endedAt)}
                      </span>

                      <span
                        title={formatDateTime(execution.startedAt)}
                        className="hidden w-16 shrink-0 text-right font-mono text-xs tabular-nums text-muted md:block"
                      >
                        {formatRelative(execution.startedAt)}
                      </span>

                      <StatusDot status={execution.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </>
  );
}
