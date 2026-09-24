"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type {
  EvidenceRef,
  HypothesisResult,
  Investigation,
} from "@/lib/investigation";

function refHref(ref: EvidenceRef) {
  switch (ref.kind) {
    case "event":
      return `/events/${ref.id}`;

    case "execution":
      return `/executions/${ref.id}`;

    case "fingerprint":
      return `/fingerprints/${ref.id}`;

    case "replay":
      return `/replays/${ref.id}`;
  }
}

function Refs({ refs }: { refs: EvidenceRef[] }) {
  return (
    <span className="ml-2 inline-flex flex-wrap gap-1.5 align-middle">
      {refs.map((ref) => (
        <Link
          key={`${ref.kind}:${ref.id}`}
          href={refHref(ref)}
          className="rounded bg-raised px-1.5 py-0.5 font-mono text-xs text-muted transition hover:text-ink"
        >
          {ref.kind}
        </Link>
      ))}
    </span>
  );
}

function Label({ children }: { children: string }) {
  return (
    <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
      {children}
    </div>
  );
}

const STATUS_CLASS: Record<HypothesisResult["status"], string> = {
  confirmed: "text-success",
  rejected: "text-failure",
  inconclusive: "text-warning",
};

export function InvestigationPanel({
  investigation,
}: {
  investigation: Investigation;
}) {
  const router = useRouter();

  const [running, setRunning] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [results, setResults] = useState<HypothesisResult[] | null>(null);

  const [conclusion, setConclusion] = useState<string | null>(null);

  async function test() {
    setRunning(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/executions/${investigation.executionId}/investigation`,
        {
          method: "POST",
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok || !data) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `Investigation failed with HTTP ${response.status}.`,
        );
      }

      setResults(data.results);
      setConclusion(data.conclusion);
      router.refresh();
    } catch (testError) {
      setError(
        testError instanceof Error
          ? testError.message
          : "Investigation failed.",
      );
    } finally {
      setRunning(false);
    }
  }

  const resultFor = (hypothesisId: string) =>
    results?.find((result) => result.hypothesisId === hypothesisId);

  return (
    <section className="mb-8 rounded-2xl border border-line bg-panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-ink">Investigation</h2>

          <p className="mt-1 max-w-2xl text-xs text-faint">
            Evidence-based and rule-based: every statement links to what it
            comes from. Testing a hypothesis replays this execution with
            dependencies answered from recordings, so nothing real happens
            again.
          </p>
        </div>

        {investigation.hypotheses.length > 0 && (
          <button
            type="button"
            onClick={test}
            disabled={running}
            className="flex h-9 shrink-0 items-center rounded-lg bg-accent px-3 text-xs font-medium text-accent-ink transition hover:brightness-110 disabled:opacity-50"
          >
            {running
              ? "Testing…"
              : `Test ${investigation.hypotheses.length} ${
                  investigation.hypotheses.length === 1
                    ? "hypothesis"
                    : "hypotheses"
                }`}
          </button>
        )}
      </div>

      <div className="mt-5 space-y-5 text-sm">
        <div>
          <Label>Observation</Label>
          <p className="text-ink">
            {investigation.observation.statement}
            <Refs refs={investigation.observation.refs} />
          </p>
        </div>

        {investigation.evidence.length > 0 && (
          <div>
            <Label>Evidence</Label>
            <ul className="space-y-1.5 text-ink-2">
              {investigation.evidence.map((finding) => (
                <li key={finding.statement}>
                  {finding.statement}
                  <Refs refs={finding.refs} />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <Label>Hypotheses</Label>

          {investigation.hypotheses.length === 0 ? (
            <p className="text-muted">
              No testable hypothesis yet. Record dependencies with rewindFetch,
              or capture a successful request to the same endpoint, to give the
              investigation more to work with.
            </p>
          ) : (
            <ol className="space-y-3">
              {investigation.hypotheses.map((hypothesis, index) => {
                const result = resultFor(hypothesis.id);

                return (
                  <li
                    key={hypothesis.id}
                    className="rounded-xl border border-line bg-canvas p-4"
                  >
                    <div className="text-ink">
                      <span className="mr-2 font-mono text-xs text-faint">
                        H{index + 1}
                      </span>
                      {hypothesis.statement}
                      <Refs refs={hypothesis.refs} />
                    </div>

                    <div className="mt-2 text-xs text-muted">
                      Experiment: {hypothesis.experiment.description}
                    </div>

                    {result && (
                      <div className="mt-2 text-xs">
                        <span
                          className={`font-semibold uppercase tracking-wider ${STATUS_CLASS[result.status]}`}
                        >
                          {result.status}
                        </span>{" "}
                        <span className="text-ink-2">
                          {result.statement}
                        </span>
                        <Refs refs={result.refs} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {conclusion && (
          <div>
            <Label>Conclusion</Label>
            <p className="text-ink">{conclusion}</p>
          </div>
        )}

        {error && <p className="text-xs text-failure">{error}</p>}
      </div>
    </section>
  );
}
