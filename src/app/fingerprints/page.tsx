import Link from "next/link";
import { connection } from "next/server";

import { getFingerprints } from "@/lib/fingerprints";

function formatDateTime(timestamp: string) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function FingerprintsPage() {
  await connection();

  const fingerprints = getFingerprints(200);

  const occurrences = fingerprints.reduce(
    (total, fingerprint) => total + fingerprint.count,
    0,
  );

  return (
    <main className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8">
          <Link
            href="/executions"
            className="text-sm text-slate-500 transition hover:text-slate-200"
          >
            ← Executions
          </Link>

          <div className="mt-5">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">
                Failures
              </h1>

              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-500">
                {fingerprints.length} distinct · {occurrences} occurrences
              </span>
            </div>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Failed executions grouped by where and how they failed. IDs,
              amounts, and timings are ignored, so the same bug recurring
              lands in one group.
            </p>
          </div>
        </div>

        {fingerprints.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.07] bg-[#0d1320] p-16 text-center">
            <div className="text-3xl text-slate-700">✓</div>

            <h2 className="mt-4 text-sm font-medium text-slate-300">
              No failures recorded
            </h2>

            <p className="mx-auto mt-1 max-w-sm text-xs text-slate-600">
              When a captured execution fails, Rewind groups it here with
              every other occurrence of the same failure.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d1320]">
            {fingerprints.map((fingerprint) => (
              <Link
                key={fingerprint.id}
                href={`/fingerprints/${fingerprint.id}`}
                className="group flex items-center gap-4 border-b border-white/[0.05] px-5 py-4 transition last:border-0 hover:bg-white/[0.03]"
              >
                <span className="w-12 shrink-0 rounded-lg bg-red-500/10 py-1.5 text-center font-mono text-sm text-red-300">
                  {fingerprint.count}×
                </span>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-200 group-hover:text-white">
                    {fingerprint.signature.message}
                  </div>

                  <div className="mt-0.5 truncate font-mono text-[11px] text-slate-600">
                    {fingerprint.signature.endpoint}
                    {" · "}
                    {fingerprint.signature.originType}
                    {fingerprint.signature.status !== null
                      ? ` · ${fingerprint.signature.status}`
                      : ""}
                    {" · via "}
                    {fingerprint.signature.path}
                  </div>
                </div>

                <span className="hidden w-40 shrink-0 text-right text-xs text-slate-600 md:block">
                  last {formatDateTime(fingerprint.lastSeenAt)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
