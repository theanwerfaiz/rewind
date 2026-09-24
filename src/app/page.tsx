import { CheckCircle2, Radio } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";

import { ExecutionsChart } from "@/components/overview/ExecutionsChart";
import { EventIcon } from "@/components/ui/EventIcon";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, Panel, Stat } from "@/components/ui/primitives";
import { Badge, StatusDot } from "@/components/ui/StatusBadge";
import { formatRelative, formatSpan } from "@/lib/format";
import { getOverview, type AttentionItem } from "@/lib/overview";

function AttentionBadge({ item }: { item: AttentionItem }) {
  switch (item.status.kind) {
    case "new":
      return <Badge tone="accent">new</Badge>;

    case "fixed":
      return (
        <Badge tone="success">
          verified fixed
          {item.status.codeVersion ? ` · ${item.status.codeVersion}` : ""}
        </Badge>
      );

    default:
      return <Badge tone="warning">recurring</Badge>;
  }
}

const SETUP_SNIPPET = `import { withRewindCapture } from "@/lib/rewind-http";

export const POST = withRewindCapture(async (request) => {
  return Response.json({ ok: true });
});`;

export default async function OverviewPage() {
  await connection();

  const overview = getOverview();

  const unfixed = overview.attention.filter(
    (item) => item.status.kind !== "fixed",
  );

  const newCount = overview.attention.filter(
    (item) => item.status.kind === "new",
  ).length;

  const failureRate =
    overview.totals.executions > 0
      ? `${((overview.totals.failed / overview.totals.executions) * 100).toFixed(1)}%`
      : "—";

  if (!overview.hasAnyExecution) {
    return (
      <>
        <PageHeader title="Overview" />

        <EmptyState
          icon={<Radio size={28} />}
          title="No executions yet"
          action={
            <pre className="w-full max-w-lg overflow-x-auto rounded-lg border border-line bg-canvas p-4 text-left font-mono text-xs leading-5 text-ink-2">
              {SETUP_SNIPPET}
            </pre>
          }
        >
          Wrap a route handler with <code>withRewindCapture</code> and send it a
          request. Every request becomes an execution you can replay, compare
          and turn into a regression test.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Overview"
        description={
          unfixed.length === 0
            ? "Nothing needs attention: every recorded failure has been verified as fixed."
            : `${unfixed.length} ${unfixed.length === 1 ? "failure needs" : "failures need"} attention${
                newCount > 0 ? `, ${newCount} new in the last 24 hours` : ""
              }.`
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Executions · 24h"
          value={overview.totals.executions.toLocaleString()}
        />
        <Stat
          label="Failed · 24h"
          value={overview.totals.failed.toLocaleString()}
          tone={overview.totals.failed > 0 ? "failure" : undefined}
        />
        <Stat
          label="Failure rate"
          value={failureRate}
          tone={overview.totals.failed > 0 ? "failure" : undefined}
        />
        <Stat
          label="Open failures"
          value={unfixed.length}
          tone={unfixed.length > 0 ? "failure" : "success"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel
          title="Needs attention"
          description="Failures grouped by fingerprint, open ones first"
          actions={
            <Link href="/fingerprints" className="text-accent hover:brightness-125">
              All failures
            </Link>
          }
          flush
        >
          {overview.attention.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted">
              <CheckCircle2 size={16} className="text-success" />
              No failures recorded.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {overview.attention.map((item) => (
                <li key={item.fingerprint.id}>
                  <Link
                    href={`/fingerprints/${item.fingerprint.id}`}
                    className="flex items-stretch gap-3 px-4 py-3 transition hover:bg-raised"
                  >
                    <span
                      aria-hidden="true"
                      className={`w-0.5 shrink-0 rounded-full ${
                        item.status.kind === "fixed"
                          ? "bg-success"
                          : item.status.kind === "new"
                            ? "bg-accent"
                            : "bg-failure"
                      }`}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-ink">
                        {item.fingerprint.signature.message}
                      </div>

                      <div className="mt-0.5 truncate font-mono text-xs text-muted">
                        {item.fingerprint.signature.endpoint} ·{" "}
                        {item.fingerprint.signature.originType}
                        {item.fingerprint.signature.status !== null
                          ? ` · ${item.fingerprint.signature.status}`
                          : ""}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end justify-center gap-1">
                      <AttentionBadge item={item} />

                      <span className="font-mono text-xs tabular-nums text-muted">
                        {item.fingerprint.count}× · {formatRelative(item.fingerprint.lastSeenAt)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel title="Executions per hour" description="Last 24 hours, replays excluded">
            <ExecutionsChart hours={overview.hours} />
          </Panel>

          <Panel
            title="Verification"
            description="Recorded failures replayed against a build"
            actions={
              <Link href="/verifications" className="text-accent hover:brightness-125">
                All runs
              </Link>
            }
            flush
          >
            {overview.verificationRuns.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">
                No runs yet. Run <code className="font-mono">npm run verify</code>{" "}
                in CI to prove failures stay fixed.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {overview.verificationRuns.map((run) => (
                  <li
                    key={run.id}
                    className="flex items-center gap-3 px-4 py-3 text-sm"
                  >
                    <Badge tone={run.failed === 0 ? "success" : "failure"}>
                      {run.failed === 0 ? "pass" : "fail"}
                    </Badge>

                    <span className="min-w-0 flex-1 truncate text-ink-2">
                      {run.passed}/{run.total} verified
                      {run.codeVersion && (
                        <span className="ml-2 font-mono text-xs text-muted">
                          {run.codeVersion}
                        </span>
                      )}
                    </span>

                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                      {formatRelative(run.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Panel
        className="mt-6"
        title="Recent executions"
        actions={
          <Link href="/executions" className="text-accent hover:brightness-125">
            All executions
          </Link>
        }
        flush
      >
        <ul className="divide-y divide-line">
          {overview.recentExecutions.map((execution) => (
            <li key={execution.id}>
              <Link
                href={`/executions/${execution.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-raised"
              >
                <EventIcon
                  type={execution.rootType ?? "http.request"}
                  status={execution.status}
                  size="sm"
                />

                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {execution.rootTitle ?? execution.id}
                </span>

                {execution.isReplay && <Badge tone="accent">replay</Badge>}

                <span className="hidden font-mono text-xs tabular-nums text-muted sm:block">
                  {execution.eventCount} ev · {formatSpan(execution.startedAt, execution.endedAt)}
                </span>

                <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-muted">
                  {formatRelative(execution.startedAt)}
                </span>

                <StatusDot status={execution.status} />
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
