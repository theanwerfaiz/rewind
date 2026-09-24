import { AsyncLocalStorage } from "node:async_hooks";

import type { DependencyReplayer } from "./dependency-replay";

export type ExecutionContext = {
  executionId: string;
  eventId: string;
  /** Set while handling a Rewind replay: how dependency calls behave. */
  replay?: DependencyReplayer;
};

const executionStorage = new AsyncLocalStorage<ExecutionContext>();

export function createExecutionId() {
  return `exe_${crypto.randomUUID()}`;
}

export function createEventId() {
  return `evt_${crypto.randomUUID()}`;
}

/**
 * Returns the execution the current async call chain belongs to, if any.
 */
export function getExecutionContext(): ExecutionContext | undefined {
  return executionStorage.getStore();
}

/**
 * Runs `callback` inside an execution. Events captured within it inherit the
 * execution ID and use `context.eventId` as their parent event.
 */
export function runInExecution<T>(
  context: ExecutionContext,
  callback: () => T,
) {
  return executionStorage.run(context, callback);
}
