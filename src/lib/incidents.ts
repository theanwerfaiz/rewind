import { randomUUID } from "node:crypto";

import db from "@/lib/db";
import { getExecutionsByIds, type RewindExecution } from "@/lib/executions";

/**
 * An incident groups the executions behind one problem, with a status and
 * running notes, so an investigation has one place to live.
 */
export type IncidentStatus = "open" | "resolved";

export type Incident = {
  id: string;
  title: string;
  status: IncidentStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  executionCount: number;
};

type IncidentRow = {
  id: string;
  title: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
  execution_count: number;
};

export const MAX_TITLE_LENGTH = 200;

export const MAX_NOTES_LENGTH = 20_000;

const INCIDENT_COLUMNS = `
  incidents.*,
  (
    SELECT COUNT(*) FROM incident_executions
    WHERE incident_executions.incident_id = incidents.id
  ) AS execution_count
`;

function mapIncident(row: IncidentRow): Incident {
  return {
    id: row.id,
    title: row.title,
    status: row.status === "resolved" ? "resolved" : "open",
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    executionCount: row.execution_count,
  };
}

export function getIncidents(limit = 100): Incident[] {
  return (
    db
      .prepare(
        `
        SELECT ${INCIDENT_COLUMNS}
        FROM incidents
        ORDER BY (status = 'open') DESC, updated_at DESC
        LIMIT ?
        `,
      )
      .all(limit) as IncidentRow[]
  ).map(mapIncident);
}

export function getIncidentById(
  id: string,
): { incident: Incident; executions: RewindExecution[] } | null {
  const row = db
    .prepare(`SELECT ${INCIDENT_COLUMNS} FROM incidents WHERE id = ?`)
    .get(id) as IncidentRow | undefined;

  if (!row) {
    return null;
  }

  const executionIds = (
    db
      .prepare(
        `SELECT execution_id FROM incident_executions WHERE incident_id = ?`,
      )
      .all(id) as { execution_id: string }[]
  ).map((link) => link.execution_id);

  return {
    incident: mapIncident(row),
    executions: getExecutionsByIds(executionIds),
  };
}

export function getIncidentsForExecution(executionId: string): Incident[] {
  return (
    db
      .prepare(
        `
        SELECT ${INCIDENT_COLUMNS}
        FROM incidents
        JOIN incident_executions
          ON incident_executions.incident_id = incidents.id
        WHERE incident_executions.execution_id = ?
        ORDER BY incidents.updated_at DESC
        `,
      )
      .all(executionId) as IncidentRow[]
  ).map(mapIncident);
}

function executionExists(executionId: string) {
  return Boolean(
    db.prepare(`SELECT 1 FROM executions WHERE id = ?`).get(executionId),
  );
}

export function createIncident(input: {
  title: unknown;
  executionId?: unknown;
}): { incident: Incident } | { error: string } {
  const title = typeof input.title === "string" ? input.title.trim() : "";

  if (title === "" || title.length > MAX_TITLE_LENGTH) {
    return { error: `Title must be 1 to ${MAX_TITLE_LENGTH} characters.` };
  }

  if (
    input.executionId !== undefined &&
    (typeof input.executionId !== "string" || !executionExists(input.executionId))
  ) {
    return { error: "Execution not found." };
  }

  const id = `inc_${randomUUID()}`;

  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO incidents (id, title, status, notes, created_at, updated_at)
       VALUES (?, ?, 'open', '', ?, ?)`,
    ).run(id, title, now, now);

    if (typeof input.executionId === "string") {
      db.prepare(
        `INSERT INTO incident_executions (incident_id, execution_id, added_at)
         VALUES (?, ?, ?)`,
      ).run(id, input.executionId, now);
    }
  })();

  return { incident: getIncidentById(id)!.incident };
}

export function updateIncident(
  id: string,
  input: Record<string, unknown>,
): { incident: Incident } | { error: string; status?: number } {
  const existing = getIncidentById(id);

  if (!existing) {
    return { error: "Incident not found.", status: 404 };
  }

  const updates: { title?: string; status?: IncidentStatus; notes?: string } = {};

  if (input.title !== undefined) {
    const title = typeof input.title === "string" ? input.title.trim() : "";

    if (title === "" || title.length > MAX_TITLE_LENGTH) {
      return { error: `Title must be 1 to ${MAX_TITLE_LENGTH} characters.` };
    }

    updates.title = title;
  }

  if (input.status !== undefined) {
    if (input.status !== "open" && input.status !== "resolved") {
      return { error: 'Status must be "open" or "resolved".' };
    }

    updates.status = input.status;
  }

  if (input.notes !== undefined) {
    if (typeof input.notes !== "string" || input.notes.length > MAX_NOTES_LENGTH) {
      return { error: `Notes must be text of at most ${MAX_NOTES_LENGTH} characters.` };
    }

    updates.notes = input.notes;
  }

  const now = new Date().toISOString();

  db.prepare(
    `UPDATE incidents
     SET title = ?, status = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    updates.title ?? existing.incident.title,
    updates.status ?? existing.incident.status,
    updates.notes ?? existing.incident.notes,
    now,
    id,
  );

  return { incident: getIncidentById(id)!.incident };
}

/** Links (or with remove, unlinks) an execution; linking twice is a no-op. */
export function setIncidentExecution(
  incidentId: string,
  executionId: unknown,
  remove = false,
): { incident: Incident } | { error: string; status?: number } {
  if (!getIncidentById(incidentId)) {
    return { error: "Incident not found.", status: 404 };
  }

  if (typeof executionId !== "string" || (!remove && !executionExists(executionId))) {
    return { error: "Execution not found.", status: 404 };
  }

  const now = new Date().toISOString();

  db.transaction(() => {
    if (remove) {
      db.prepare(
        `DELETE FROM incident_executions WHERE incident_id = ? AND execution_id = ?`,
      ).run(incidentId, executionId);
    } else {
      db.prepare(
        `INSERT OR IGNORE INTO incident_executions (incident_id, execution_id, added_at)
         VALUES (?, ?, ?)`,
      ).run(incidentId, executionId, now);
    }

    db.prepare(`UPDATE incidents SET updated_at = ? WHERE id = ?`).run(now, incidentId);
  })();

  return { incident: getIncidentById(incidentId)!.incident };
}
