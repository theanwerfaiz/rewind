import Link from "next/link";
import { connection } from "next/server";

import { getFingerprints } from "@/lib/fingerprints";
import { PageHeader } from "@/components/ui/PageHeader";

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
    <>
      <PageHeader
        crumbs={[{ label: "Monitor" }, { label: "Failures" }]}
        title="Failures"
        description="Failed executions grouped by where and how they failed. IDs, amounts and timings are ignored, so the same bug recurring lands in one group."
        meta={
          <span>
            {fingerprints.length} distinct · {occurrences} occurrences
          </span>
        }
      />

        {fingerprints.length === 0 ? (
          <div className="rounded-2xl border border-line bg-panel p-16 text-center">
            <div className="text-3xl text-faint">✓</div>

            <h2 className="mt-4 text-sm font-medium text-ink-2">
              No failures recorded
            </h2>

            <p className="mx-auto mt-1 max-w-sm text-xs text-faint">
              When a captured execution fails, Rewind groups it here with every
              other occurrence of the same failure.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-panel">
            {fingerprints.map((fingerprint) => (
              <Link
                key={fingerprint.id}
                href={`/fingerprints/${fingerprint.id}`}
                className="group flex items-center gap-4 border-b border-line px-5 py-4 transition last:border-0 hover:bg-panel"
              >
                <span className="w-12 shrink-0 rounded-lg bg-failure-soft py-1.5 text-center font-mono text-sm text-failure">
                  {fingerprint.count}×
                </span>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink group-hover:text-ink">
                    {fingerprint.signature.message}
                  </div>

                  <div className="mt-0.5 truncate font-mono text-xs text-faint">
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

                <span className="hidden w-40 shrink-0 text-right text-xs text-faint md:block">
                  last {formatDateTime(fingerprint.lastSeenAt)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </>
  );
}
