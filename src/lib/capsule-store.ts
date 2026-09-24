import db from "@/lib/db";
import {
  buildCapsule,
  type Capsule,
  type CapsuleExecution,
} from "@/lib/capsule";
import { getExecutionById } from "@/lib/executions";
import {
  assignExecutionFingerprint,
  ensureFingerprints,
} from "@/lib/fingerprints";
import { getReplaysForEvent } from "@/lib/replays";
import { scanForSecrets, type ScanFinding } from "@/lib/secret-scan";

/**
 * Builds the capsule for a stored execution and scans it for secrets.
 * Returns null when the execution does not exist.
 */
export function exportCapsule(
  executionId: string,
): { capsule: Capsule; findings: ScanFinding[] } | null {
  ensureFingerprints();

  const result = getExecutionById(executionId);

  if (!result) {
    return null;
  }

  const { execution, events, edges } = result;

  const capsuleExecution: CapsuleExecution = {
    id: execution.id,
    startedAt: execution.startedAt,
    endedAt: execution.endedAt,
    status: execution.status,
    traceId: execution.traceId,
    rootEventId: execution.rootEventId,
    environment: execution.environment,
    fingerprintId: execution.fingerprintId,
  };

  const experiments = execution.rootEventId
    ? getReplaysForEvent(execution.rootEventId)
        .filter((replay) => replay.sourceExecutionId === execution.id)
        .map((replay) => ({
          label: replay.label,
          mutations: replay.mutations,
          dependencyMode: replay.dependencyMode,
          status: replay.status,
        }))
    : [];

  const capsule = buildCapsule({
    execution: capsuleExecution,
    events,
    edges,
    experiments,
  });

  return {
    capsule,
    findings: scanForSecrets(capsule),
  };
}

export type ImportResult =
  | {
      imported: true;
      executionId: string;
    }
  | {
      imported: false;
      reason: string;
    };

/**
 * Imports a validated capsule, preserving execution and event IDs so the
 * capsule can be replayed and compared like a locally captured execution.
 * Nothing is written if any of its IDs already exist.
 */
export function importCapsule(capsule: Capsule): ImportResult {
  const now = new Date().toISOString();

  const insertEvent = db.prepare(`
    INSERT INTO events (
      id, timestamp, type, title, status, duration, source, trace_id,
      span_id, request_id, session_id, user_id, execution_id,
      parent_event_id, metadata, payload, created_at
    )
    VALUES (
      @id, @timestamp, @type, @title, @status, @duration, @source, @trace_id,
      @span_id, @request_id, @session_id, @user_id, @execution_id,
      @parent_event_id, @metadata, @payload, @created_at
    )
  `);

  const insertEdge = db.prepare(`
    INSERT OR IGNORE INTO event_edges (
      id, execution_id, from_event_id, to_event_id, type, origin,
      confidence, created_at
    )
    VALUES (
      @id, @execution_id, @from_event_id, @to_event_id, @type, @origin,
      @confidence, @created_at
    )
  `);

  return db
    .transaction((): ImportResult => {
      const { execution } = capsule;

      if (
        db.prepare(`SELECT 1 FROM executions WHERE id = ?`).get(execution.id)
      ) {
        return {
          imported: false,
          reason: `Execution ${execution.id} already exists in this Rewind.`,
        };
      }

      const clash = capsule.events.find((event) =>
        db.prepare(`SELECT 1 FROM events WHERE id = ?`).get(event.id),
      );

      if (clash) {
        return {
          imported: false,
          reason: `Event ${clash.id} already exists in this Rewind.`,
        };
      }

      for (const event of capsule.events) {
        insertEvent.run({
          id: event.id,
          timestamp: event.timestamp,
          type: event.type,
          title: event.title,
          status: event.status,
          duration: event.duration ?? null,
          source: event.source ?? null,
          trace_id: event.traceId ?? null,
          span_id: event.spanId ?? null,
          request_id: event.requestId ?? null,
          session_id: event.sessionId ?? null,
          user_id: event.userId ?? null,
          execution_id: execution.id,
          parent_event_id: event.parentEventId ?? null,
          metadata:
            event.metadata === undefined || event.metadata === null
              ? null
              : JSON.stringify(event.metadata),
          payload:
            event.payload === undefined || event.payload === null
              ? null
              : JSON.stringify(event.payload),
          created_at: event.createdAt ?? now,
        });
      }

      for (const edge of capsule.edges) {
        insertEdge.run({
          id: edge.id,
          execution_id: execution.id,
          from_event_id: edge.fromEventId,
          to_event_id: edge.toEventId,
          type: edge.type,
          origin: edge.origin,
          confidence: edge.confidence,
          created_at: edge.createdAt,
        });
      }

      db.prepare(
        `
        INSERT INTO executions (
          id, started_at, ended_at, status, trace_id, root_event_id,
          environment, event_count, created_at, updated_at, capsule_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        execution.id,
        execution.startedAt,
        execution.endedAt,
        execution.status,
        execution.traceId,
        execution.rootEventId,
        execution.environment,
        capsule.events.length,
        now,
        now,
        capsule.id,
      );

      db.prepare(
        `
        INSERT INTO capsule_imports (
          id, execution_id, digest, capsule_created_at, imported_at
        )
        VALUES (?, ?, ?, ?, ?)
        `,
      ).run(
        capsule.id,
        execution.id,
        capsule.integrity.digest,
        capsule.createdAt,
        now,
      );

      assignExecutionFingerprint(execution.id);

      return {
        imported: true,
        executionId: execution.id,
      };
    })
    .immediate();
}

export type CapsuleImportRecord = {
  id: string;
  executionId: string;
  capsuleCreatedAt: string;
  importedAt: string;
  rootTitle: string | null;
  status: string | null;
};

export function getCapsuleImports(limit = 100): CapsuleImportRecord[] {
  return (
    db
      .prepare(
        `
        SELECT
          capsule_imports.id,
          capsule_imports.execution_id,
          capsule_imports.capsule_created_at,
          capsule_imports.imported_at,
          root.title AS root_title,
          executions.status
        FROM capsule_imports
        LEFT JOIN executions ON executions.id = capsule_imports.execution_id
        LEFT JOIN events AS root ON root.id = executions.root_event_id
        ORDER BY capsule_imports.imported_at DESC
        LIMIT ?
        `,
      )
      .all(limit) as {
      id: string;
      execution_id: string;
      capsule_created_at: string;
      imported_at: string;
      root_title: string | null;
      status: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    executionId: row.execution_id,
    capsuleCreatedAt: row.capsule_created_at,
    importedAt: row.imported_at,
    rootTitle: row.root_title,
    status: row.status,
  }));
}
