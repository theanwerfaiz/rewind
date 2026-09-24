import db from "@/lib/db";
import type { Invariant, InvariantDefinition } from "@/lib/invariants";

type InvariantRow = {
  id: string;
  definition: string;
};

export function getInvariantsForExecution(executionId: string): Invariant[] {
  return (
    db
      .prepare(
        `
        SELECT id, definition
        FROM invariants
        WHERE execution_id = ?
        ORDER BY created_at ASC, id ASC
        `,
      )
      .all(executionId) as InvariantRow[]
  ).map((row) => ({
    ...(JSON.parse(row.definition) as InvariantDefinition),
    id: row.id,
  }));
}

export function addInvariant(
  executionId: string,
  definition: InvariantDefinition,
  id = `inv_${crypto.randomUUID()}`,
): Invariant {
  db.prepare(
    `
    INSERT OR IGNORE INTO invariants (id, execution_id, definition, created_at)
    VALUES (?, ?, ?, ?)
    `,
  ).run(id, executionId, JSON.stringify(definition), new Date().toISOString());

  return {
    ...definition,
    id,
  };
}

export function deleteInvariant(id: string) {
  return db.prepare(`DELETE FROM invariants WHERE id = ?`).run(id).changes > 0;
}
