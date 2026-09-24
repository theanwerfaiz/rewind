import { GitCompareArrows } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { TrendBars } from "@/components/fingerprints/TrendBars";
import { EventIcon } from "@/components/ui/EventIcon";
import { IdChip } from "@/components/ui/IdChip";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink, Panel } from "@/components/ui/primitives";
import { Badge, StatusDot } from "@/components/ui/StatusBadge";
import { getExecutionsByFingerprint } from "@/lib/executions";
import { getFingerprintTrend, getLastKnownGood } from "@/lib/fingerprint-history";
import { getFingerprintById } from "@/lib/fingerprints";
import { formatDateTime, formatRelative, formatSpan, shortId } from "@/lib/format";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const fingerprint = getFingerprintById(id);

  return {
    title: fingerprint ? `Failure · ${fingerprint.signature.message}` : "Failure not found",
  };
}

export default async function FingerprintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();

  const { id } = await params;

  const fingerprint = getFingerprintById(id);

  if (!fingerprint) {
    notFound();
  }

  const executions = getExecutionsByFingerprint(id);

  const { signature } = fingerprint;

  const trend = getFingerprintTrend(fingerprint.id);

  const trendTotal = trend.reduce((total, bucket) => total + bucket.count, 0);

  const lastGood = getLastKnownGood(fingerprint);

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Failures", href: "/fingerprints" },
          { label: shortId(fingerprint.id) },
        ]}
        badges={
          <>
            <Badge tone="failure">failure fingerprint</Badge>
            <Badge>
              {fingerprint.count}{" "}
              {fingerprint.count === 1 ? "occurrence" : "occurrences"}
            </Badge>
          </>
        }
        title={signature.message}
        meta={<IdChip id={fingerprint.id} full />}
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Panel
          title="Last 14 days"
          description={`${trendTotal} ${trendTotal === 1 ? "occurrence" : "occurrences"} · first seen ${formatRelative(fingerprint.firstSeenAt)}, last ${formatRelative(fingerprint.lastSeenAt)}`}
        >
          <TrendBars days={trend} />
        </Panel>

        <Panel
          title="Last known good"
          description="Newest successful run of the same endpoint"
        >
          {lastGood ? (
            <div className="flex flex-col gap-3">
              <Link
                href={`/executions/${lastGood.id}`}
                className="flex items-center gap-2 text-sm text-ink hover:text-accent"
              >
                <StatusDot status="success" />
                <span className="truncate">{lastGood.rootTitle}</span>
              </Link>

              <div className="font-mono text-xs text-muted">
                {formatDateTime(lastGood.startedAt)} ·{" "}
                {Date.parse(lastGood.startedAt) > Date.parse(fingerprint.lastSeenAt)
                  ? "after the last failure"
                  : "before the last failure"}
              </div>

              <ButtonLink
                href={`/executions/compare?original=${fingerprint.latestExecutionId}&candidate=${lastGood.id}`}
                variant="primary"
              >
                <GitCompareArrows size={14} />
                Diff latest failure with it
              </ButtonLink>
            </div>
          ) : (
            <p className="text-sm text-muted">
              No successful run of <code className="font-mono">{signature.endpoint}</code>{" "}
              has been captured. Replay the failure in the Lab to find one.
            </p>
          )}
        </Panel>

        <Panel title="Signature">
          <dl className="grid grid-cols-2 gap-3 text-xs [&>div:first-child]:col-span-2 [&>div:last-child]:col-span-2">
            <div>
              <dt className="text-faint">Endpoint</dt>
              <dd className="mt-0.5 break-all font-mono text-ink-2">{signature.endpoint}</dd>
            </div>

            <div>
              <dt className="text-faint">Origin</dt>
              <dd className="mt-0.5 font-mono text-ink-2">{signature.originType}</dd>
            </div>

            <div>
              <dt className="text-faint">HTTP status</dt>
              <dd className="mt-0.5 font-mono text-ink-2">{signature.status ?? "—"}</dd>
            </div>

            <div>
              <dt className="text-faint">Failure path</dt>
              <dd className="mt-0.5 break-all font-mono text-ink-2">{signature.path}</dd>
            </div>
          </dl>
        </Panel>
      </div>

      <Panel title="Executions that failed this way" flush>
        <ul className="divide-y divide-line">
          {executions.map((execution) => (
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
                  <div className="truncate text-sm text-ink">
                    {execution.rootTitle ?? "Untitled execution"}
                  </div>

                  <div className="mt-0.5 truncate font-mono text-xs text-muted">
                    {shortId(execution.id)}
                    {execution.environment ? ` · ${execution.environment}` : ""}
                    {execution.isReplay ? " · replay" : ""}
                  </div>
                </div>

                {execution.id === fingerprint.representativeExecutionId && (
                  <Badge tone="neutral">first</Badge>
                )}

                <span className="hidden font-mono text-xs tabular-nums text-muted sm:block">
                  {formatSpan(execution.startedAt, execution.endedAt)}
                </span>

                <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-muted">
                  {formatRelative(execution.startedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
      </>
  );
}
