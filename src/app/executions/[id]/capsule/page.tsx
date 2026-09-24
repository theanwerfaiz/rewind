import { notFound } from "next/navigation";
import { connection } from "next/server";

import { exportCapsule } from "@/lib/capsule-store";
import { hasBlockingFindings } from "@/lib/secret-scan";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/StatusBadge";
import { shortId } from "@/lib/format";
import type { Metadata } from "next";
import { getExecutionById } from "@/lib/executions";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-canvas p-4">
      <div className="text-xs uppercase tracking-wider text-faint">
        {label}
      </div>

      <div className="mt-1.5 font-mono text-lg text-ink">{value}</div>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const found = getExecutionById(id);

  return {
    title: found ? `Capsule · ${found.execution.rootTitle ?? id}` : "Execution not found",
  };
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
    <>
      <PageHeader
        crumbs={[
          { label: "Executions", href: "/executions" },
          {
            label: shortId(capsule.execution.id),
            href: `/executions/${capsule.execution.id}`,
          },
          { label: "Capsule" },
        ]}
        badges={<Badge tone="accent">reproduction capsule</Badge>}
        title={rootTitle}
        description={
          capsule.replay
            ? "Ready to reproduce: the capsule carries the request, its recorded dependencies and the expected outcome."
            : "This execution has no replayable root request; the capsule preserves its events for inspection only."
        }
      />

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
              ? "border-failure/25 bg-failure-soft"
              : "border-success/20 bg-success-soft"
          }`}
        >
          <h2
            className={`text-sm font-medium ${
              blocked ? "text-failure" : "text-success"
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

          <p className="mt-1 text-xs text-muted">
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
                        ? "text-failure"
                        : "text-warning"
                    }
                  >
                    {finding.rule}
                  </span>
                  <span className="text-muted">{finding.path}</span>
                  <span className="text-faint">{finding.preview}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {blocked ? (
              <>
                <span className="text-sm text-failure">
                  Export is blocked until these are removed.
                </span>

                <a
                  href={`${downloadUrl}?force=1`}
                  className="rounded-lg border border-failure/30 px-3 py-2 text-xs text-failure transition hover:bg-failure-soft"
                >
                  Export anyway (includes secrets)
                </a>
              </>
            ) : (
              <a
                href={downloadUrl}
                className="flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink transition hover:brightness-110"
              >
                ↓ Download .rewind.json
              </a>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-panel p-6">
          <h2 className="text-sm font-medium text-ink">Contents</h2>

          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-xs text-faint">Format</dt>
              <dd className="font-mono text-ink-2">
                {capsule.format} v{capsule.version}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-faint">Execution</dt>
              <dd className="truncate font-mono text-ink-2">
                {capsule.execution.id}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-faint">Replay</dt>
              <dd className="truncate font-mono text-ink-2">
                {capsule.replay
                  ? `${capsule.replay.method} ${capsule.replay.path} · dependencies ${capsule.replay.dependencyMode}`
                  : "—"}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-faint">Fingerprint</dt>
              <dd className="truncate font-mono text-ink-2">
                {capsule.expected.fingerprintId ?? "—"}
              </dd>
            </div>

            <div className="md:col-span-2">
              <dt className="text-xs text-faint">
                Integrity (sha256, computed at download)
              </dt>
              <dd className="break-all font-mono text-xs text-muted">
                {capsule.integrity.digest}
              </dd>
            </div>
          </dl>
        </section>
      </>
  );
}
