import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { getExecutionsByFingerprint } from "@/lib/executions";
import { getFingerprintById } from "@/lib/fingerprints";

function formatDateTime(timestamp: string) {
  return new Date(timestamp).toLocaleString();
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-white/5 pb-3 last:border-0 last:pb-0">
      <span className="text-xs uppercase tracking-wider text-slate-500">
        {label}
      </span>

      <span className="break-all font-mono text-sm text-slate-200">
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
    <main className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8">
          <Link
            href="/fingerprints"
            className="text-sm text-slate-500 transition hover:text-slate-200"
          >
            ← All failures
          </Link>
        </div>

        <div className="mb-8">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs uppercase tracking-wider text-red-300">
              Failure fingerprint
            </span>

            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-400">
              {fingerprint.count}{" "}
              {fingerprint.count === 1 ? "occurrence" : "occurrences"}
            </span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">
            {signature.message}
          </h1>

          <p className="mt-2 font-mono text-xs text-slate-500">
            {fingerprint.id}
          </p>
        </div>

        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/[0.07] bg-[#0d1320] p-6">
            <h2 className="mb-5 text-sm font-medium text-slate-200">
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

          <section className="rounded-2xl border border-white/[0.07] bg-[#0d1320] p-6">
            <h2 className="mb-5 text-sm font-medium text-slate-200">History</h2>

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

        <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d1320]">
          <h2 className="border-b border-white/[0.06] px-5 py-4 text-sm font-medium text-slate-200">
            Executions that failed this way
          </h2>

          {executions.map((execution) => (
            <Link
              key={execution.id}
              href={`/executions/${execution.id}`}
              className="group flex items-center gap-4 border-b border-white/[0.05] px-5 py-3.5 transition last:border-0 hover:bg-white/[0.03]"
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-red-400" />

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-200 group-hover:text-white">
                  {execution.rootTitle ?? "Untitled execution"}
                </div>

                <div className="mt-0.5 truncate font-mono text-[11px] text-slate-600">
                  {execution.id}
                </div>
              </div>

              <span className="shrink-0 text-xs text-slate-600">
                {formatDateTime(execution.startedAt)}
              </span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
