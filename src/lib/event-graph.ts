import type { RewindEvent } from "./mock-events";

export type EdgeType = "parent_of";

export type EdgeOrigin = "explicit" | "inferred";

export type EventEdge = {
  id: string;
  executionId: string | null;
  fromEventId: string;
  toEventId: string;
  type: EdgeType;
  origin: EdgeOrigin;
  confidence: number;
  createdAt: string;
};

export type GraphNode = {
  event: RewindEvent;
  depth: number;
  childIds: string[];
  /**
   * True when the event names a parent that is not part of this execution
   * (for example, the parent capture failed). It is shown as a root.
   */
  orphan: boolean;
};

export type ExecutionGraph = {
  /** Nodes in depth-first order, children in chronological order. */
  nodes: GraphNode[];
  rootIds: string[];
  /**
   * Where the failure originated: the earliest error event with no failing
   * descendants. A parent that failed only because a child failed (e.g. a
   * 500 wrapping a payment timeout) is on the failure path, not its origin.
   */
  firstFailureId: string | null;
  /** Root → … → first failure, following parent edges. */
  failurePath: string[];
};

function compareChronologically(left: RewindEvent, right: RewindEvent) {
  return (
    left.timestamp.localeCompare(right.timestamp) ||
    (left.createdAt ?? "").localeCompare(right.createdAt ?? "") ||
    left.id.localeCompare(right.id)
  );
}

/**
 * Builds the execution tree from events and their parent edges.
 *
 * Pure: it performs no I/O, so it can be tested and reused for diffs.
 * Chronology is preserved at every level, and cycles or duplicate parents
 * in bad data cannot cause infinite recursion or duplicated nodes.
 */
export function buildExecutionGraph(
  events: RewindEvent[],
  edges: EventEdge[],
): ExecutionGraph {
  const sorted = [...events].sort(compareChronologically);

  const byId = new Map(sorted.map((event) => [event.id, event]));

  const parentOf = new Map<string, string>();

  for (const edge of edges) {
    if (
      edge.type === "parent_of" &&
      byId.has(edge.fromEventId) &&
      byId.has(edge.toEventId) &&
      edge.fromEventId !== edge.toEventId &&
      !parentOf.has(edge.toEventId)
    ) {
      parentOf.set(edge.toEventId, edge.fromEventId);
    }
  }

  const childrenOf = new Map<string, string[]>();

  for (const event of sorted) {
    const parentId = parentOf.get(event.id);

    if (parentId) {
      childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), event.id]);
    }
  }

  const nodes: GraphNode[] = [];

  const visited = new Set<string>();

  function visit(eventId: string, depth: number, orphan: boolean) {
    if (visited.has(eventId)) {
      return;
    }

    visited.add(eventId);

    const childIds = (childrenOf.get(eventId) ?? []).filter(
      (childId) => !visited.has(childId),
    );

    nodes.push({
      event: byId.get(eventId)!,
      depth,
      childIds,
      orphan,
    });

    for (const childId of childIds) {
      visit(childId, depth + 1, false);
    }
  }

  const rootIds: string[] = [];

  for (const event of sorted) {
    if (!parentOf.has(event.id)) {
      rootIds.push(event.id);

      visit(event.id, 0, Boolean(event.parentEventId));
    }
  }

  // Anything still unvisited sits on a parent cycle. Surface it as a root
  // rather than dropping evidence.
  for (const event of sorted) {
    if (!visited.has(event.id)) {
      rootIds.push(event.id);

      visit(event.id, 0, true);
    }
  }

  const hasFailingDescendant = new Set<string>();

  for (const event of sorted) {
    if (event.status !== "error") {
      continue;
    }

    const seen = new Set<string>([event.id]);

    let ancestor = parentOf.get(event.id);

    while (ancestor && !seen.has(ancestor)) {
      seen.add(ancestor);
      hasFailingDescendant.add(ancestor);
      ancestor = parentOf.get(ancestor);
    }
  }

  const failures = sorted.filter((event) => event.status === "error");

  const firstFailure =
    failures.find((event) => !hasFailingDescendant.has(event.id)) ??
    failures[0];

  const failurePath: string[] = [];

  if (firstFailure) {
    const seen = new Set<string>();

    let current: string | undefined = firstFailure.id;

    while (current && !seen.has(current)) {
      seen.add(current);
      failurePath.unshift(current);
      current = parentOf.get(current);
    }
  }

  return {
    nodes,
    rootIds,
    firstFailureId: firstFailure?.id ?? null,
    failurePath,
  };
}
