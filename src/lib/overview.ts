import db from "@/lib/db";
import { getExecutions, isReplayExecutionSql, type RewindExecution } from "@/lib/executions";
import { getFingerprints, type FingerprintSummary } from "@/lib/fingerprints";
import { getVerificationRuns, type VerificationRun } from "@/lib/verification";

export type HourBucket = {
  /** Start of the hour, ISO. */
  hour: string;
  total: number;
  failed: number;
};

export type FailureStatus =
  | { kind: "new" }
  | { kind: "fixed"; codeVersion: string | null }
  | { kind: "recurring" };

export type AttentionItem = {
  fingerprint: FingerprintSummary;
  status: FailureStatus;
};

export type Overview = {
  hours: HourBucket[];
  totals: {
    executions: number;
    failed: number;
  };
  attention: AttentionItem[];
  recentExecutions: RewindExecution[];
  verificationRuns: VerificationRun[];
  hasAnyExecution: boolean;
};

const HOUR_MS = 60 * 60 * 1000;

/**
 * Real (non-replay) executions per hour over the last 24 hours, oldest
 * first, with empty hours filled in.
 */
export function getHourlyExecutions(now = Date.now()): HourBucket[] {
  const currentHour = Math.floor(now / HOUR_MS) * HOUR_MS;

  const since = new Date(currentHour - 23 * HOUR_MS).toISOString();

  const rows = db
    .prepare(
      `
      SELECT
        started_at,
        status
      FROM executions
      WHERE started_at >= ?
        AND NOT ${isReplayExecutionSql("executions")}
      `,
    )
    .all(since) as { started_at: string; status: string }[];

  const buckets = Array.from({ length: 24 }, (_, index) => ({
    hour: new Date(currentHour - (23 - index) * HOUR_MS).toISOString(),
    total: 0,
    failed: 0,
  }));

  for (const row of rows) {
    const index =
      23 - Math.floor((currentHour - Math.floor(Date.parse(row.started_at) / HOUR_MS) * HOUR_MS) / HOUR_MS);

    const bucket = buckets[index];

    if (!bucket) {
      continue;
    }

    bucket.total += 1;

    if (row.status === "error") {
      bucket.failed += 1;
    }
  }

  return buckets;
}

function latestVerdicts(runs: VerificationRun[]) {
  // Newest run first: the first verdict seen per execution is the latest.
  const verdicts = new Map<
    string,
    { verdict: string; codeVersion: string | null }
  >();

  for (const run of runs) {
    for (const result of run.results) {
      if (!verdicts.has(result.executionId)) {
        verdicts.set(result.executionId, {
          verdict: result.verdict,
          codeVersion: run.codeVersion,
        });
      }
    }
  }

  return verdicts;
}

export function getOverview(now = Date.now()): Overview {
  const hours = getHourlyExecutions(now);

  const verificationRuns = getVerificationRuns(10);

  const verdicts = latestVerdicts(verificationRuns);

  const attention = getFingerprints(50)
    .map((fingerprint): AttentionItem => {
      const verdict = verdicts.get(fingerprint.representativeExecutionId);

      if (verdict?.verdict === "pass") {
        return {
          fingerprint,
          status: {
            kind: "fixed",
            codeVersion: verdict.codeVersion,
          },
        };
      }

      if (now - Date.parse(fingerprint.firstSeenAt) < 24 * HOUR_MS) {
        return {
          fingerprint,
          status: {
            kind: "new",
          },
        };
      }

      return {
        fingerprint,
        status: {
          kind: "recurring",
        },
      };
    })
    // Unfixed failures first, newest activity first within each group.
    .sort(
      (left, right) =>
        Number(left.status.kind === "fixed") -
          Number(right.status.kind === "fixed") ||
        right.fingerprint.lastSeenAt.localeCompare(left.fingerprint.lastSeenAt),
    )
    .slice(0, 8);

  const recentExecutions = getExecutions(8);

  const anyExecution = db
    .prepare(`SELECT 1 FROM executions LIMIT 1`)
    .get();

  return {
    hours,
    totals: {
      executions: hours.reduce((sum, bucket) => sum + bucket.total, 0),
      failed: hours.reduce((sum, bucket) => sum + bucket.failed, 0),
    },
    attention,
    recentExecutions,
    verificationRuns: verificationRuns.slice(0, 4),
    hasAnyExecution: Boolean(anyExecution),
  };
}
