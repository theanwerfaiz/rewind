import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { exportCapsule } from "@/lib/capsule-store";
import { hasBlockingFindings } from "@/lib/secret-scan";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-600">
        {label}
      </div>

      <div className="mt-1.5 font-mono text-lg text-slate-200">{value}</div>
    </div>
  );
}

export default async function ExecutionCapsulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();

  const { id } = await params;

  const result = exportCapsule(id);

  if (!result) {
    notFound();
  }

  const { capsule, findings } = result;

  const blocked = hasBlockingFindings(findings);

  const secrets = findings.filter((finding) => finding.severity === "secret");

  const personalData = findings.filter((finding) => finding.severity === "pii");

  const downloadUrl = `/api/executions/${capsule.execution.id}/capsule`;

  const rootTitle =
    capsule.events.find((event) => event.id === capsule.execution.rootEventId)
      ?.title ?? capsule.execution.id;

  return (
    <main className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <Link
          href={`/executions/${capsule.execution.id}`}
          className="text-sm text-slate-500 transition hover:text-slate-200"
        >
          ← Execution
        </Link>

        <div className="mb-8 mt-5">
          <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs uppercase tracking-wider text-violet-300">
            Reproduction Capsule
          </span>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {rootTitle}
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            {capsule.replay
              ? "Ready to reproduce: the capsule carries the request, its recorded dependencies, and the expected outcome."
              : "This execution has no replayable root request; the capsule preserves its events for inspection only."}
          </p>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Events" value={capsule.events.length} />

          <Stat
            label="Dependencies"
            value={capsule.replay?.fixtures.length ?? 0}
          />

          <Stat label="Experiments" value={capsule.experiments.length} />

          <Stat
            label="Expected"
            value={`${capsule.expected.status}${
              capsule.expected.httpStatus
                ? ` · ${capsule.expected.httpStatus}`
                : ""
            }`}
          />
        </div>

        <section
          className={`mb-6 rounded-2xl border p-6 ${
            blocked
              ? "border-red-500/25 bg-red-500/[0.04]"
              : "border-emerald-500/20 bg-emerald-500/[0.03]"
          }`}
        >
          <h2
            className={`text-sm font-medium ${
              blocked ? "text-red-200" : "text-emerald-200"
            }`}
          >
            {blocked
              ? `Secret scan: ${secrets.length} likely secret${
                  secrets.length === 1 ? "" : "s"
                } found`
              : `Secret scan: no secrets found${
                  personalData.length > 0
                    ? ` · ${personalData.length} personal-data warning${
                        personalData.length === 1 ? "" : "s"
                      }`
                    : ""
                }`}
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Headers and credential-like fields are redacted at capture. This
            scan catches secrets that slipped into free-form values.
          </p>

          {findings.length > 0 && (
            <ul className="mt-4 space-y-1.5 font-mono text-xs">
              {[...secrets, ...personalData].map((finding, index) => (
                <li
                  key={`${finding.path}-${index}`}
                  className="flex flex-wrap gap-2"
                >
                  <span
                    className={
                      finding.severity === "secret"
                        ? "text-red-300"
                        : "text-amber-300"
                    }
                  >
                    {finding.rule}
                  </span>
                  <span className="text-slate-500">{finding.path}</span>
                  <span className="text-slate-600">{finding.preview}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {blocked ? (
              <>
                <span className="text-sm text-red-300">
                  Export is blocked until these are removed.
                </span>

                <a
                  href={`${downloadUrl}?force=1`}
                  className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-200 transition hover:bg-red-500/10"
                >
                  Export anyway (includes secrets)
                </a>
              </>
            ) : (
              <a
                href={downloadUrl}
                className="flex h-10 items-center rounded-lg bg-white px-4 text-sm font-medium text-black transition hover:bg-slate-200"
              >
                ↓ Download .rewind.json
              </a>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.07] bg-[#0d1320] p-6">
          <h2 className="text-sm font-medium text-slate-200">Contents</h2>

          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-600">Format</dt>
              <dd className="font-mono text-slate-300">
                {capsule.format} v{capsule.version}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-slate-600">Execution</dt>
              <dd className="truncate font-mono text-slate-300">
                {capsule.execution.id}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-slate-600">Replay</dt>
              <dd className="truncate font-mono text-slate-300">
                {capsule.replay
                  ? `${capsule.replay.method} ${capsule.replay.path} · dependencies ${capsule.replay.dependencyMode}`
                  : "—"}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-slate-600">Fingerprint</dt>
              <dd className="truncate font-mono text-slate-300">
                {capsule.expected.fingerprintId ?? "—"}
              </dd>
            </div>

            <div className="md:col-span-2">
              <dt className="text-xs text-slate-600">
                Integrity (sha256, computed at download)
              </dt>
              <dd className="break-all font-mono text-xs text-slate-500">
                {capsule.integrity.digest}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}
