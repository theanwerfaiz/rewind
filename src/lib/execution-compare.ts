import { diffExecutions, type ExecutionDiff } from "@/lib/execution-diff";
import { getExecutionGraphById } from "@/lib/executions";
import { ensureFingerprints } from "@/lib/fingerprints";
import { getInvariantsForExecution } from "@/lib/invariant-store";
import {
  describeInvariant,
  evaluateInvariant,
  type InvariantSubject,
} from "@/lib/invariants";

function subjectOf(
  snapshot: NonNullable<ReturnType<typeof getExecutionGraphById>>,
): InvariantSubject {
  return {
    status: snapshot.execution.status,
    startedAt: snapshot.execution.startedAt,
    endedAt: snapshot.execution.endedAt,
    rootEventId: snapshot.execution.rootEventId,
    events: snapshot.events,
  };
}

/**
 * Loads two stored executions and diffs them. Returns null when either
 * execution does not exist.
 */
export function compareExecutions(
  originalId: string,
  candidateId: string,
): ExecutionDiff | null {
  // Fingerprints decide "still failing" vs "different failure".
  ensureFingerprints();

  const original = getExecutionGraphById(originalId);
  const candidate = getExecutionGraphById(candidateId);

  if (!original || !candidate) {
    return null;
  }

  const diff = diffExecutions(original, candidate);

  // The original's invariants define the expected behaviour.
  const invariants = getInvariantsForExecution(originalId).map((invariant) => ({
    invariant,
    description: describeInvariant(invariant),
    original: evaluateInvariant(invariant, subjectOf(original)),
    candidate: evaluateInvariant(invariant, subjectOf(candidate)),
  }));

  for (const comparison of invariants) {
    if (!comparison.candidate.passed) {
      diff.summary.push(
        `Invariant failed: ${comparison.description} (got ${comparison.candidate.actual})`,
      );
    } else if (!comparison.original.passed) {
      diff.summary.push(`Invariant now holds: ${comparison.description}`);
    }
  }

  return {
    ...diff,
    invariants,
  };
}
