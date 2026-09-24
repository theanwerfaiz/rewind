import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { getExecutionsByFingerprint } from "@/lib/executions";
import { getFingerprintById } from "@/lib/fingerprints";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/StatusBadge";
import { IdChip } from "@/components/ui/IdChip";
import { shortId } from "@/lib/format";

function formatDateTime(timestamp: string) {
  return new Date(timestamp).toLocaleString();
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line pb-3 last:border-0 last:pb-0">
      <span className="text-xs uppercase tracking-wider text-muted">
        {label}
      </span>

      <span className="break-all font-mono text-sm text-ink">
        {value}
      </span>
    </div>
  );
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

        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-line bg-panel p-6">
            <h2 className="mb-5 text-sm font-medium text-ink">
              Signature
            </h2>

            <div className="space-y-4">
              <Row label="Endpoint" value={signature.endpoint} />

              <Row label="Origin event type" value={signature.originType} />

              <Row
                label="HTTP status"
                value={
                  signature.status !== null ? String(signature.status) : "—"
                }
              />

              <Row label="Failure path" value={signature.path} />
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-panel p-6">
            <h2 className="mb-5 text-sm font-medium text-ink">History</h2>

            <div className="space-y-4">
              <Row
                label="First seen"
                value={formatDateTime(fingerprint.firstSeenAt)}
              />

              <Row
                label="Last seen"
                value={formatDateTime(fingerprint.lastSeenAt)}
              />

              <Row
                label="First execution"
                value={fingerprint.representativeExecutionId}
              />
            </div>
          </section>
        </div>

        <section className="overflow-hidden rounded-2xl border border-line bg-panel">
          <h2 className="border-b border-line px-5 py-4 text-sm font-medium text-ink">
            Executions that failed this way
          </h2>

          {executions.map((execution) => (
            <Link
              key={execution.id}
              href={`/executions/${execution.id}`}
              className="group flex items-center gap-4 border-b border-line px-5 py-3.5 transition last:border-0 hover:bg-panel"
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-failure" />

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-ink group-hover:text-ink">
                  {execution.rootTitle ?? "Untitled execution"}
                </div>

                <div className="mt-0.5 truncate font-mono text-xs text-faint">
                  {execution.id}
                </div>
              </div>

              <span className="shrink-0 text-xs text-faint">
                {formatDateTime(execution.startedAt)}
              </span>
            </Link>
          ))}
        </section>
      </>
  );
}
