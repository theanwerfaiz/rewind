/**
 * Formats a verification run for CI: a Markdown summary (for a GitHub job
 * summary or a PR comment) and workflow annotations for failures. Pure and
 * dependency-free, so the verify script can import it directly.
 */

export type ReportResult = {
  title: string;
  executionId: string;
  outcome: string | null;
  verdict: "pass" | "fail";
  reason: string;
  resultExecutionId?: string | null;
};

export type ReportRun = {
  id: string;
  codeVersion: string | null;
  target: string | null;
  total: number;
  passed: number;
  failed: number;
  results: ReportResult[];
};

export const OUTCOME_LABELS: Record<string, string> = {
  fixed: "fixed",
  still_failing: "still failing",
  different_failure: "fails differently",
  regressed: "regressed",
  behavior_changed: "behaviour changed",
  unchanged: "unchanged",
};

/** Keeps table cells on one row and stops Markdown or HTML injection. */
function cell(value: string) {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/[|\\`*_<>[\]]/g, (character) => `\\${character}`)
    .slice(0, 200);
}

export function formatMarkdownReport(run: ReportRun, rewindUrl?: string) {
  const base = rewindUrl?.replace(/\/+$/, "");

  const lines: string[] = [];

  lines.push(
    run.failed === 0
      ? `### ✅ Rewind: ${run.passed}/${run.total} recorded ${run.total === 1 ? "failure" : "failures"} verified`
      : `### ❌ Rewind: ${run.failed} of ${run.total} did not verify`,
  );

  lines.push("");

  lines.push(
    `Replayed against ${cell(run.target ?? "the default target")}${
      run.codeVersion ? ` at \`${cell(run.codeVersion)}\`` : ""
    }.`,
  );

  lines.push("");
  lines.push("| | Outcome | Execution | Detail |");
  lines.push("|---|---|---|---|");

  // Failures first: they are what a reviewer needs to read.
  const ordered = [...run.results].sort(
    (left, right) =>
      (left.verdict === "fail" ? 0 : 1) - (right.verdict === "fail" ? 0 : 1),
  );

  for (const result of ordered) {
    const outcome = result.outcome
      ? (OUTCOME_LABELS[result.outcome] ?? result.outcome)
      : "not run";

    const diff =
      base && result.resultExecutionId
        ? ` · [diff](${base}/executions/compare?original=${encodeURIComponent(
            result.executionId,
          )}&candidate=${encodeURIComponent(result.resultExecutionId)})`
        : "";

    lines.push(
      `| ${result.verdict === "pass" ? "✅" : "❌"} | ${cell(outcome)} | ${cell(
        result.title,
      )}${diff} | ${cell(result.reason)} |`,
    );
  }

  if (base) {
    lines.push("");
    lines.push(`[All verification runs](${base}/verifications)`);
  }

  lines.push("");

  return lines.join("\n");
}

/** GitHub Actions annotations: one ::error line per failed result. */
export function formatAnnotations(run: ReportRun) {
  const escape = (value: string) =>
    value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

  const escapeProperty = (value: string) =>
    escape(value).replace(/:/g, "%3A").replace(/,/g, "%2C");

  return run.results
    .filter((result) => result.verdict === "fail")
    .map(
      (result) =>
        `::error title=${escapeProperty(`Rewind: ${result.title}`)}::${escape(result.reason)}`,
    );
}
