import db from "@/lib/db";
import {
  getRecentSuccessfulExecutions,
  isReplayExecutionSql,
  type RewindExecution,
} from "@/lib/executions";
import { normalizeEndpoint } from "@/lib/fingerprint";
import type { FingerprintSummary } from "@/lib/fingerprints";

const DAY_MS = 24 * 60 * 60 * 1000;

export type DayBucket = {
  /** Start of the UTC day, ISO. */
  day: string;
  count: number;
};

/** Occurrences per UTC day over the last `days` days, replays excluded. */
export function getFingerprintTrend(
  fingerprintId: string,
  days = 14,
  now = Date.now(),
): DayBucket[] {
  const today = Math.floor(now / DAY_MS) * DAY_MS;

  const since = today - (days - 1) * DAY_MS;

  const rows = db
    .prepare(
      `
      SELECT executions.started_at
      FROM executions
      WHERE executions.fingerprint_id = ?
        AND executions.started_at >= ?
        AND NOT ${isReplayExecutionSql("executions")}
      `,
    )
    .all(fingerprintId, new Date(since).toISOString()) as {
    started_at: string;
  }[];

  const buckets: DayBucket[] = Array.from({ length: days }, (_, index) => ({
    day: new Date(since + index * DAY_MS).toISOString(),
    count: 0,
  }));

  for (const row of rows) {
    const index = Math.floor((Date.parse(row.started_at) - since) / DAY_MS);

    if (buckets[index]) {
      buckets[index].count += 1;
    }
  }

  return buckets;
}

/**
 * The newest successful execution of the endpoint this failure happens on:
 * the natural baseline to diff a failure against.
 */
export function getLastKnownGood(
  fingerprint: FingerprintSummary,
): RewindExecution | null {
  return (
    getRecentSuccessfulExecutions(500).find(
      (execution) =>
        execution.rootTitle !== null &&
        normalizeEndpoint(execution.rootTitle) === fingerprint.signature.endpoint,
    ) ?? null
  );
}
