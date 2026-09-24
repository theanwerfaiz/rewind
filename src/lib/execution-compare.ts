import { diffExecutions, type ExecutionDiff } from "@/lib/execution-diff";
import { getExecutionGraphById } from "@/lib/executions";
import { ensureFingerprints } from "@/lib/fingerprints";

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

  return diffExecutions(original, candidate);
}
