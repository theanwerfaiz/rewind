import { FlaskConical } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { EventIcon } from "@/components/ui/EventIcon";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, Panel } from "@/components/ui/primitives";
import { Badge, HttpStatus, StatusDot } from "@/components/ui/StatusBadge";
import { getExecutions } from "@/lib/executions";
import { formatRelative, formatSpan } from "@/lib/format";
import { describeMutation } from "@/lib/mutations";
import { getRecentExperiments } from "@/lib/replays";

export const metadata: Metadata = {
  title: "Replay Lab",
};

const LAB_TYPES = new Set(["http.request", "webhook.received"]);

export default async function LabIndexPage() {
  await connection();

  const requests = getExecutions(200)
    .filter(
      (execution) =>
        !execution.isReplay &&
        execution.rootEventId &&
        execution.rootType &&
        LAB_TYPES.has(execution.rootType),
    )
    // Failures first: they are what people come here to reproduce.
    .sort((left, right) =>
      left.status === right.status ? 0 : left.status === "error" ? -1 : 1,
    )
    .slice(0, 12);

  const experiments = getRecentExperiments(20);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Debug" }, { label: "Replay Lab" }]}
        title="Replay Lab"
        description="Replay a captured request against your application, change one thing at a time, and diff what the application did."
      />

      {requests.length === 0 && experiments.length === 0 ? (
        <EmptyState icon={<FlaskConical size={28} />} title="Nothing to replay yet">
          Capture a request with <code>withRewindCapture</code> or a webhook,
          then open it here to run experiments.
        </EmptyState>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel
            title="Start from a captured request"
            description="Failed requests first"
            flush
          >
            {requests.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">
                No captured requests or webhooks.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {requests.map((execution) => (
                  <li key={execution.id}>
                    <Link
                      href={`/lab/${execution.rootEventId}`}
                      className="flex items-center gap-3 px-4 py-3 transition hover:bg-raised"
                    >
                      <EventIcon
                        type={execution.rootType ?? "http.request"}
                        status={execution.status}
                        size="sm"
                      />

                      <span className="min-w-0 flex-1 truncate text-sm text-ink">
                        {execution.rootTitle ?? execution.id}
                      </span>

                      <span className="hidden font-mono text-xs tabular-nums text-muted sm:block">
                        {formatSpan(execution.startedAt, execution.endedAt)}
                      </span>

                      <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-muted">
                        {formatRelative(execution.startedAt)}
                      </span>

                      <StatusDot status={execution.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recent experiments" flush>
            {experiments.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">
                No experiments yet. Open a request to run one.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {experiments.map((experiment) => (
                  <li
                    key={experiment.id}
                    className="flex items-center gap-3 px-4 py-3 text-sm"
                  >
                    <HttpStatus status={experiment.status} />

                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/lab/${experiment.eventId}`}
                        className="block truncate text-ink hover:text-accent"
                      >
                        {experiment.label ??
                        (experiment.mutations.length === 0
                          ? "Plain replay"
                          : "Unlabelled experiment")}
                      </Link>

                      <div className="mt-0.5 truncate font-mono text-xs text-muted">
                        {experiment.eventTitle ?? experiment.url}
                        {experiment.mutations.length > 0 &&
                          ` · ${experiment.mutations.map(describeMutation).join(" · ")}`}
                      </div>
                    </div>

                    {experiment.dependencyMode === "live" && (
                      <Badge tone="warning">live deps</Badge>
                    )}

                    {experiment.sourceExecutionId && experiment.resultExecutionId && (
                      <Link
                        href={`/executions/compare?original=${experiment.sourceExecutionId}&candidate=${experiment.resultExecutionId}`}
                        className="shrink-0 text-xs text-accent hover:brightness-125"
                      >
                        Diff
                      </Link>
                    )}

                    <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-muted">
                      {formatRelative(experiment.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
