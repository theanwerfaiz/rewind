import { getExecutionsUpdatedSince, type RewindExecution } from "@/lib/executions";

/** What the live stream sends for each new or changed execution. */
export type LiveExecution = {
  id: string;
  title: string;
  status: RewindExecution["status"];
  isReplay: boolean;
  fingerprintId: string | null;
  startedAt: string;
  updatedAt: string;
};

export function toLiveExecution(execution: RewindExecution): LiveExecution {
  return {
    id: execution.id,
    title: execution.rootTitle ?? execution.id,
    status: execution.status,
    isReplay: execution.isReplay,
    fingerprintId: execution.fingerprintId,
    startedAt: execution.startedAt,
    updatedAt: execution.updatedAt,
  };
}

/** One Server-Sent Events message. Data is JSON, so it has no newlines. */
export function formatSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Reads what changed since the cursor and returns the next cursor, so a
 * poll never misses or repeats a change.
 */
export function pollExecutions(cursor: string) {
  const executions = getExecutionsUpdatedSince(cursor).map(toLiveExecution);

  return {
    executions,
    cursor: executions.at(-1)?.updatedAt ?? cursor,
  };
}
