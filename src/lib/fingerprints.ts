import db from "@/lib/db";
import { getExecutionGraphById } from "@/lib/executions";
import {
  computeFailureFingerprint,
  FINGERPRINT_VERSION,
  type FailureSignature,
} from "@/lib/fingerprint";

export type FingerprintSummary = {
  id: string;
  signature: FailureSignature;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  /** The first execution that failed this way. */
  representativeExecutionId: string;
  latestExecutionId: string;
};

type FingerprintRow = {
  id: string;
  endpoint: string;
  origin_type: string;
  message: string;
  status: number | null;
  path: string;
  count: number;
  first_seen_at: string;
  last_seen_at: string;
  representative_execution_id: string;
  latest_execution_id: string;
};

function mapFingerprint(row: FingerprintRow): FingerprintSummary {
  return {
    id: row.id,
    signature: {
      endpoint: row.endpoint,
      originType: row.origin_type,
      message: row.message,
      status: row.status,
      path: row.path,
    },
    count: row.count,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    representativeExecutionId: row.representative_execution_id,
    latestExecutionId: row.latest_execution_id,
  };
}

/**
 * Recomputes the fingerprint of one execution from its current graph.
 * Call inside the transaction that changed the execution: the fingerprint
 * can change as child events arrive, so it is derived, never accumulated.
 */
export function assignExecutionFingerprint(executionId: string) {
  const execution = db
    .prepare(`SELECT status FROM executions WHERE id = ?`)
    .get(executionId) as { status: string } | undefined;

  // Only failed executions have fingerprints. An execution can turn from a
  // provisional error to success when its root arrives, so clear any
  // fingerprint it was given in the meantime.
  if (execution?.status !== "error") {
    db.prepare(
      `
      UPDATE executions
      SET fingerprint_id = NULL, fingerprint_version = NULL
      WHERE id = ? AND fingerprint_id IS NOT NULL
      `,
    ).run(executionId);

    return null;
  }

  const result = getExecutionGraphById(executionId);

  if (!result) {
    return null;
  }

  const fingerprint = computeFailureFingerprint(result.graph);

  if (fingerprint) {
    db.prepare(
      `
      INSERT OR IGNORE INTO failure_fingerprints (
        id,
        version,
        endpoint,
        origin_type,
        message,
        status,
        path,
        created_at
      )
      VALUES (
        @id,
        @version,
        @endpoint,
        @origin_type,
        @message,
        @status,
        @path,
        @created_at
      )
      `,
    ).run({
      id: fingerprint.id,
      version: FINGERPRINT_VERSION,
      endpoint: fingerprint.signature.endpoint,
      origin_type: fingerprint.signature.originType,
      message: fingerprint.signature.message,
      status: fingerprint.signature.status,
      path: fingerprint.signature.path,
      created_at: new Date().toISOString(),
    });
  }

  db.prepare(
    `
    UPDATE executions
    SET fingerprint_id = ?, fingerprint_version = ?
    WHERE id = ?
    `,
  ).run(fingerprint?.id ?? null, FINGERPRINT_VERSION, executionId);

  return fingerprint;
}

/**
 * Fingerprints failed executions that have none yet, or that were
 * fingerprinted by an older algorithm version.
 */
export function ensureFingerprints() {
  const stale = db
    .prepare(
      `
      SELECT id
      FROM executions
      WHERE status = 'error'
        AND (fingerprint_version IS NULL OR fingerprint_version < ?)
      `,
    )
    .all(FINGERPRINT_VERSION) as { id: string }[];

  if (stale.length === 0) {
    return 0;
  }

  db.transaction(() => {
    for (const { id } of stale) {
      assignExecutionFingerprint(id);
    }
  }).immediate();

  return stale.length;
}

const FINGERPRINT_QUERY = `
  SELECT
    f.*,
    COUNT(e.id) AS count,
    MIN(e.started_at) AS first_seen_at,
    MAX(e.started_at) AS last_seen_at,
    (
      SELECT id FROM executions
      WHERE fingerprint_id = f.id
      ORDER BY started_at ASC
      LIMIT 1
    ) AS representative_execution_id,
    (
      SELECT id FROM executions
      WHERE fingerprint_id = f.id
      ORDER BY started_at DESC
      LIMIT 1
    ) AS latest_execution_id
  FROM failure_fingerprints AS f
  JOIN executions AS e
    ON e.fingerprint_id = f.id
`;

export function getFingerprints(limit = 100): FingerprintSummary[] {
  ensureFingerprints();

  const rows = db
    .prepare(
      `
      ${FINGERPRINT_QUERY}
      GROUP BY f.id
      ORDER BY last_seen_at DESC
      LIMIT ?
      `,
    )
    .all(limit) as FingerprintRow[];

  return rows.map(mapFingerprint);
}

export function getFingerprintById(id: string): FingerprintSummary | null {
  ensureFingerprints();

  const row = db
    .prepare(
      `
      ${FINGERPRINT_QUERY}
      WHERE f.id = ?
      GROUP BY f.id
      `,
    )
    .get(id) as FingerprintRow | undefined;

  return row ? mapFingerprint(row) : null;
}
