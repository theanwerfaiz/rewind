import type { ExecutionGraph } from "./event-graph";
import type { Invariant, InvariantResult } from "./invariants";
import { normalizeEndpoint } from "./fingerprint";
import type { RewindEvent } from "./mock-events";
import { findReplayChanges, type ReplayChange } from "./replay-diff";

/**
 * Behavioural comparison of two executions, typically an original and a
 * replay of it. Events are aligned by their position in the execution tree
 * (normalised titles from the root), not by ID, because a replay produces
 * entirely new event IDs.
 */

export type ExecutionSnapshot = {
  execution: {
    id: string;
    status: string;
    startedAt: string;
    endedAt: string;
    fingerprintId: string | null;
  };
  graph: ExecutionGraph;
};

export type EventChangeKind =
  | "status"
  | "http_status"
  | "response"
  | "payload"
  | "timing";

export type EventChange = {
  key: string;
  original: RewindEvent;
  candidate: RewindEvent;
  kinds: EventChangeKind[];
  status?: {
    from: string;
    to: string;
  };
  httpStatus?: {
    from: number | null;
    to: number | null;
  };
  durationMs?: {
    from: number;
    to: number;
  };
  payloadChanges: ReplayChange[];
  responseChanges: ReplayChange[];
};

export type DiffOutcome =
  | "fixed"
  | "regressed"
  | "still_failing"
  | "different_failure"
  | "behavior_changed"
  | "unchanged";

export type TimingVerdict = "improved" | "regressed" | "unchanged";

export type ExecutionDiff = {
  outcome: DiffOutcome;
  original: SideSummary;
  candidate: SideSummary;
  added: RewindEvent[];
  removed: RewindEvent[];
  changed: EventChange[];
  unchangedCount: number;
  errors: {
    removed: RewindEvent[];
    added: RewindEvent[];
    persisted: number;
  };
  /** The earliest point where behaviour differs, by offset into the run. */
  firstDivergence: {
    kind: "added" | "removed" | "changed";
    event: RewindEvent;
    offsetMs: number;
  } | null;
  timing: {
    originalMs: number;
    candidateMs: number;
    deltaMs: number;
    verdict: TimingVerdict;
  };
  summary: string[];
  /**
   * The original execution's invariants evaluated on both sides. Set by
   * compareExecutions, which has access to stored invariants.
   */
  invariants?: InvariantComparison[];
};

export type InvariantComparison = {
  invariant: Invariant;
  description: string;
  original: InvariantResult;
  candidate: InvariantResult;
};

type SideSummary = {
  executionId: string;
  status: string;
  httpStatus: number | null;
  durationMs: number;
  eventCount: number;
  fingerprintId: string | null;
};

type AlignedNode = {
  key: string;
  event: RewindEvent;
  offsetMs: number;
};

/** Timing differences below both thresholds are treated as noise. */
const TIMING_MIN_DELTA_MS = 5;
const TIMING_MIN_RATIO = 0.1;

const MAX_SUMMARY_ITEMS = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getResponse(event: RewindEvent) {
  const response = isRecord(event.metadata)
    ? event.metadata.response
    : undefined;

  return isRecord(response) ? response : undefined;
}

function getHttpStatus(event: RewindEvent) {
  const status = getResponse(event)?.status;

  return typeof status === "number" ? status : null;
}

function getDurationMs(event: RewindEvent) {
  const match = event.duration?.match(/^([\d.]+)\s*(ms|s)$/i);

  if (!match) {
    return null;
  }

  const value = Number(match[1]);

  return match[2].toLowerCase() === "s" ? value * 1000 : value;
}

function spanMs(startedAt: string, endedAt: string) {
  return Math.max(Date.parse(endedAt) - Date.parse(startedAt), 0);
}

function timingVerdict(fromMs: number, toMs: number): TimingVerdict {
  const delta = toMs - fromMs;

  if (
    Math.abs(delta) < TIMING_MIN_DELTA_MS ||
    Math.abs(delta) < Math.max(fromMs, 1) * TIMING_MIN_RATIO
  ) {
    return "unchanged";
  }

  return delta < 0 ? "improved" : "regressed";
}

/**
 * Gives each event a key made of the normalised titles on its path from
 * the root plus its occurrence index among identical siblings, so
 * "POST /api/orders/1" and its replay "POST /api/orders/1?dryRun=1" align.
 */
function alignNodes(snapshot: ExecutionSnapshot): AlignedNode[] {
  const startedAt = Date.parse(snapshot.execution.startedAt);

  const keyById = new Map<string, string>();

  const occurrences = new Map<string, number>();

  const parentById = new Map<string, string>();

  for (const node of snapshot.graph.nodes) {
    for (const childId of node.childIds) {
      parentById.set(childId, node.event.id);
    }
  }

  return snapshot.graph.nodes.map((node) => {
    const parentKey = keyById.get(parentById.get(node.event.id) ?? "") ?? "";

    const localKey = `${node.event.type}:${normalizeEndpoint(node.event.title)}`;

    const siblingKey = `${parentKey}>${localKey}`;

    const occurrence = occurrences.get(siblingKey) ?? 0;

    occurrences.set(siblingKey, occurrence + 1);

    const key = `${siblingKey}#${occurrence}`;

    keyById.set(node.event.id, key);

    return {
      key,
      event: node.event,
      offsetMs: Math.max(Date.parse(node.event.timestamp) - startedAt, 0),
    };
  });
}

function compareEvents(
  key: string,
  original: RewindEvent,
  candidate: RewindEvent,
): EventChange {
  const kinds: EventChangeKind[] = [];

  const change: EventChange = {
    key,
    original,
    candidate,
    kinds,
    payloadChanges: [],
    responseChanges: [],
  };

  if (original.status !== candidate.status) {
    kinds.push("status");
    change.status = {
      from: original.status,
      to: candidate.status,
    };
  }

  const fromHttp = getHttpStatus(original);
  const toHttp = getHttpStatus(candidate);

  if (fromHttp !== toHttp) {
    kinds.push("http_status");
    change.httpStatus = {
      from: fromHttp,
      to: toHttp,
    };
  }

  change.payloadChanges = findReplayChanges(
    original.payload,
    candidate.payload,
    "payload",
  );

  if (change.payloadChanges.length > 0) {
    kinds.push("payload");
  }

  change.responseChanges = findReplayChanges(
    getResponse(original)?.body,
    getResponse(candidate)?.body,
    "body",
  );

  if (change.responseChanges.length > 0) {
    kinds.push("response");
  }

  const fromMs = getDurationMs(original);
  const toMs = getDurationMs(candidate);

  if (
    fromMs !== null &&
    toMs !== null &&
    timingVerdict(fromMs, toMs) !== "unchanged"
  ) {
    kinds.push("timing");
    change.durationMs = {
      from: fromMs,
      to: toMs,
    };
  }

  return change;
}

function summarize(snapshot: ExecutionSnapshot): SideSummary {
  const root = snapshot.graph.nodes.find((node) => node.depth === 0)?.event;

  return {
    executionId: snapshot.execution.id,
    status: snapshot.execution.status,
    httpStatus: root ? getHttpStatus(root) : null,
    durationMs: spanMs(
      snapshot.execution.startedAt,
      snapshot.execution.endedAt,
    ),
    eventCount: snapshot.graph.nodes.length,
    fingerprintId: snapshot.execution.fingerprintId,
  };
}

function listItems(prefix: string, events: RewindEvent[]) {
  const lines = events
    .slice(0, MAX_SUMMARY_ITEMS)
    .map((event) => `${prefix}: ${event.title}`);

  if (events.length > MAX_SUMMARY_ITEMS) {
    lines.push(`${prefix}: +${events.length - MAX_SUMMARY_ITEMS} more`);
  }

  return lines;
}

function formatMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

export function diffExecutions(
  original: ExecutionSnapshot,
  candidate: ExecutionSnapshot,
): ExecutionDiff {
  const originalNodes = alignNodes(original);
  const candidateNodes = alignNodes(candidate);

  const candidateByKey = new Map(
    candidateNodes.map((node) => [node.key, node]),
  );

  const originalKeys = new Set(originalNodes.map((node) => node.key));

  const removed: AlignedNode[] = [];
  const changed: { change: EventChange; offsetMs: number }[] = [];

  let unchangedCount = 0;

  const errors = {
    removed: [] as RewindEvent[],
    added: [] as RewindEvent[],
    persisted: 0,
  };

  for (const node of originalNodes) {
    const match = candidateByKey.get(node.key);

    if (!match) {
      removed.push(node);

      if (node.event.status === "error") {
        errors.removed.push(node.event);
      }

      continue;
    }

    const change = compareEvents(node.key, node.event, match.event);

    if (change.kinds.length === 0) {
      unchangedCount += 1;
    } else {
      changed.push({
        change,
        offsetMs: match.offsetMs,
      });
    }

    const wasError = node.event.status === "error";
    const isError = match.event.status === "error";

    if (wasError && isError) {
      errors.persisted += 1;
    } else if (wasError) {
      errors.removed.push(node.event);
    } else if (isError) {
      errors.added.push(match.event);
    }
  }

  const added = candidateNodes.filter((node) => !originalKeys.has(node.key));

  for (const node of added) {
    if (node.event.status === "error") {
      errors.added.push(node.event);
    }
  }

  // Timing-only differences are reported but do not count as divergence.
  const behaviourChanges = changed.filter(({ change }) =>
    change.kinds.some((kind) => kind !== "timing"),
  );

  // A changed event with a changed or added descendant is an effect of it
  // (a 500 wrapping a failed call), not where behaviour diverged. Removed
  // descendants belong to the original run's timeline, so they do not
  // explain a change in the candidate.
  const candidateSideKeys = [
    ...behaviourChanges.map(({ change }) => change.key),
    ...added.map((node) => node.key),
  ];

  const isEffect = (key: string) =>
    candidateSideKeys.some((other) => other.startsWith(`${key}>`));

  const divergences = [
    ...removed.map((node) => ({
      kind: "removed" as const,
      event: node.event,
      offsetMs: node.offsetMs,
    })),
    ...added.map((node) => ({
      kind: "added" as const,
      event: node.event,
      offsetMs: node.offsetMs,
    })),
    ...behaviourChanges
      .filter(({ change }) => !isEffect(change.key))
      .map(({ change, offsetMs }) => ({
        kind: "changed" as const,
        event: change.candidate,
        offsetMs,
      })),
  ].sort((left, right) => left.offsetMs - right.offsetMs);

  const originalSummary = summarize(original);
  const candidateSummary = summarize(candidate);

  const wasFailing = originalSummary.status === "error";
  const isFailing = candidateSummary.status === "error";

  let outcome: DiffOutcome;

  if (wasFailing && !isFailing) {
    outcome = "fixed";
  } else if (!wasFailing && isFailing) {
    outcome = "regressed";
  } else if (wasFailing && isFailing) {
    outcome =
      originalSummary.fingerprintId !== null &&
      originalSummary.fingerprintId === candidateSummary.fingerprintId
        ? "still_failing"
        : "different_failure";
  } else {
    outcome = divergences.length > 0 ? "behavior_changed" : "unchanged";
  }

  const timing = {
    originalMs: originalSummary.durationMs,
    candidateMs: candidateSummary.durationMs,
    deltaMs: candidateSummary.durationMs - originalSummary.durationMs,
    verdict: timingVerdict(
      originalSummary.durationMs,
      candidateSummary.durationMs,
    ),
  };

  const summary: string[] = [
    ...listItems("Failure removed", errors.removed),
    ...listItems("New failure", errors.added),
    ...listItems(
      "Removed event",
      removed
        .map((node) => node.event)
        .filter((event) => event.status !== "error"),
    ),
    ...listItems(
      "Added event",
      added
        .map((node) => node.event)
        .filter((event) => event.status !== "error"),
    ),
  ];

  for (const { change } of changed.slice(0, MAX_SUMMARY_ITEMS)) {
    const subject =
      change.candidate.type === "http.dependency" ? "dependency" : "status";

    if (change.httpStatus) {
      summary.push(
        `Changed ${subject}: ${change.candidate.title} (${change.httpStatus.from ?? "—"} → ${change.httpStatus.to ?? "—"})`,
      );
    } else if (change.responseChanges.length > 0) {
      summary.push(
        `Changed response: ${change.candidate.title} (${change.responseChanges.length} ${
          change.responseChanges.length === 1 ? "field" : "fields"
        })`,
      );
    }
  }

  if (timing.verdict !== "unchanged") {
    summary.push(
      `Latency ${timing.verdict}: ${formatMs(timing.originalMs)} → ${formatMs(
        timing.candidateMs,
      )}`,
    );
  }

  return {
    outcome,
    original: originalSummary,
    candidate: candidateSummary,
    added: added.map((node) => node.event),
    removed: removed.map((node) => node.event),
    changed: changed.map(({ change }) => change),
    unchangedCount,
    errors,
    firstDivergence: divergences[0] ?? null,
    timing,
    summary,
  };
}
