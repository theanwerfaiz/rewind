import db from "@/lib/db";
import type { EdgeOrigin, EdgeType, EventEdge } from "@/lib/event-graph";

type EdgeRow = {
  id: string;
  execution_id: string | null;
  from_event_id: string;
  to_event_id: string;
  type: EdgeType;
  origin: EdgeOrigin;
  confidence: number;
  created_at: string;
};

function mapEdge(row: EdgeRow): EventEdge {
  return {
    id: row.id,
    executionId: row.execution_id,
    fromEventId: row.from_event_id,
    toEventId: row.to_event_id,
    type: row.type,
    origin: row.origin,
    confidence: row.confidence,
    createdAt: row.created_at,
  };
}

/**
 * Stores the explicit parent → child edge declared by a captured event.
 * Call inside the same transaction that inserts the child event.
 */
export function recordParentEdge(edge: {
  executionId: string | null;
  parentEventId: string;
  childEventId: string;
  createdAt: string;
}) {
  db.prepare(
    `
    INSERT OR IGNORE INTO event_edges (
      id,
      execution_id,
      from_event_id,
      to_event_id,
      type,
      origin,
      confidence,
      created_at
    )
    VALUES (
      @id,
      @execution_id,
      @from_event_id,
      @to_event_id,
      'parent_of',
      'explicit',
      1,
      @created_at
    )
    `,
  ).run({
    id: `edg_${crypto.randomUUID()}`,
    execution_id: edge.executionId,
    from_event_id: edge.parentEventId,
    to_event_id: edge.childEventId,
    created_at: edge.createdAt,
  });
}

export function getEdgesForExecution(executionId: string): EventEdge[] {
  const rows = db
    .prepare(
      `
      SELECT *
      FROM event_edges
      WHERE execution_id = ?
      ORDER BY created_at ASC
      `,
    )
    .all(executionId) as EdgeRow[];

  return rows.map(mapEdge);
}
