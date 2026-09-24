import { createHash } from "node:crypto";

import {
  buildFixtures,
  type DependencyFixture,
  type DependencyMode,
} from "./dependency-replay";
import type { EventEdge } from "./event-graph";
import type { RewindEvent } from "./mock-events";
import type { Mutation } from "./mutations";

/**
 * A Reproduction Capsule: a portable, versioned, verifiable file that
 * carries one execution with everything needed to reproduce it.
 */

export const CAPSULE_FORMAT = "rewind.capsule";

export const CAPSULE_VERSION = 1;

export const MAX_CAPSULE_EVENTS = 5000;

export type CapsuleExecution = {
  id: string;
  startedAt: string;
  endedAt: string;
  status: "success" | "error";
  traceId: string | null;
  rootEventId: string | null;
  environment: string | null;
  fingerprintId: string | null;
};

export type CapsuleReplay = {
  /** The root request to send again. */
  eventId: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  payload: unknown;
  dependencyMode: DependencyMode;
  fixtures: DependencyFixture[];
};

export type CapsuleExperiment = {
  label: string | null;
  mutations: Mutation[];
  dependencyMode: DependencyMode | null;
  status: number;
};

export type CapsuleBody = {
  format: typeof CAPSULE_FORMAT;
  version: typeof CAPSULE_VERSION;
  createdAt: string;
  execution: CapsuleExecution;
  events: RewindEvent[];
  edges: EventEdge[];
  replay: CapsuleReplay | null;
  /** What the execution did when captured; verification compares to it. */
  expected: {
    status: "success" | "error";
    httpStatus: number | null;
    fingerprintId: string | null;
  };
  experiments: CapsuleExperiment[];
};

export type Capsule = CapsuleBody & {
  id: string;
  integrity: {
    algorithm: "sha256";
    digest: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * JSON with object keys sorted at every level, so the same content always
 * hashes the same regardless of key order.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item ?? null)).join(",")}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value ?? null);
}

export function computeCapsuleDigest(body: CapsuleBody) {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}

function getHttpStatus(event: RewindEvent | undefined) {
  const response = isRecord(event?.metadata)
    ? event.metadata.response
    : undefined;

  return isRecord(response) && typeof response.status === "number"
    ? response.status
    : null;
}

function buildReplay(root: RewindEvent | undefined, events: RewindEvent[]) {
  if (
    !root ||
    (root.type !== "http.request" && root.type !== "webhook.received") ||
    !isRecord(root.metadata)
  ) {
    return null;
  }

  const { method, path, headers } = root.metadata;

  if (typeof path !== "string") {
    return null;
  }

  return {
    eventId: root.id,
    method: typeof method === "string" ? method : "POST",
    path,
    headers: isRecord(headers)
      ? (Object.fromEntries(
          Object.entries(headers).filter(
            ([, value]) => typeof value === "string" && value !== "[REDACTED]",
          ),
        ) as Record<string, string>)
      : {},
    payload: root.payload ?? null,
    dependencyMode: "recorded" as const,
    fixtures: buildFixtures(events),
  };
}

export function buildCapsule({
  execution,
  events,
  edges,
  experiments = [],
  createdAt = new Date().toISOString(),
}: {
  execution: CapsuleExecution;
  events: RewindEvent[];
  edges: EventEdge[];
  experiments?: CapsuleExperiment[];
  createdAt?: string;
}): Capsule {
  const sortedEvents = [...events].sort(
    (left, right) =>
      left.timestamp.localeCompare(right.timestamp) ||
      left.id.localeCompare(right.id),
  );

  const root = sortedEvents.find((event) => event.id === execution.rootEventId);

  const body: CapsuleBody = {
    format: CAPSULE_FORMAT,
    version: CAPSULE_VERSION,
    createdAt,
    execution,
    events: sortedEvents,
    edges: [...edges].sort((left, right) => left.id.localeCompare(right.id)),
    replay: buildReplay(root, sortedEvents),
    expected: {
      status: execution.status,
      httpStatus: getHttpStatus(root),
      fingerprintId: execution.fingerprintId,
    },
    experiments,
  };

  const digest = computeCapsuleDigest(body);

  return {
    ...body,
    id: `cap_${digest.slice(0, 16)}`,
    integrity: {
      algorithm: "sha256",
      digest,
    },
  };
}

const EVENT_STATUSES = new Set(["success", "error", "neutral"]);

/**
 * Validates an untrusted capsule: structure, internal references, and the
 * integrity digest (so an edited capsule is rejected).
 */
export function validateCapsule(
  input: unknown,
): { capsule: Capsule } | { errors: string[] } {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return {
      errors: ["A capsule must be a JSON object."],
    };
  }

  if (input.format !== CAPSULE_FORMAT) {
    errors.push(`format must be "${CAPSULE_FORMAT}".`);
  }

  if (input.version !== CAPSULE_VERSION) {
    errors.push(
      `Unsupported capsule version ${JSON.stringify(input.version)}; this Rewind reads version ${CAPSULE_VERSION}.`,
    );
  }

  const execution = input.execution;

  if (
    !isRecord(execution) ||
    typeof execution.id !== "string" ||
    !/^exe_[A-Za-z0-9_-]{1,128}$/.test(execution.id) ||
    typeof execution.startedAt !== "string" ||
    typeof execution.endedAt !== "string" ||
    (execution.status !== "success" && execution.status !== "error")
  ) {
    errors.push(
      "execution must have an exe_ id, startedAt, endedAt and status.",
    );
  }

  const events = input.events;

  if (!Array.isArray(events) || events.length === 0) {
    errors.push("events must be a non-empty array.");
  } else if (events.length > MAX_CAPSULE_EVENTS) {
    errors.push(`A capsule may hold at most ${MAX_CAPSULE_EVENTS} events.`);
  }

  if (!Array.isArray(input.edges)) {
    errors.push("edges must be an array.");
  }

  if (errors.length > 0) {
    return {
      errors,
    };
  }

  const executionId = (execution as { id: string }).id;

  const eventIds = new Set<string>();

  for (const [index, event] of (events as unknown[]).entries()) {
    if (
      !isRecord(event) ||
      typeof event.id !== "string" ||
      !/^evt_[A-Za-z0-9_-]{1,128}$/.test(event.id) ||
      typeof event.type !== "string" ||
      typeof event.title !== "string" ||
      typeof event.timestamp !== "string" ||
      Number.isNaN(Date.parse(event.timestamp)) ||
      !EVENT_STATUSES.has(String(event.status))
    ) {
      errors.push(`events[${index}] is not a valid event.`);
      continue;
    }

    if (event.executionId !== executionId) {
      errors.push(`events[${index}] does not belong to the capsule execution.`);
    }

    if (eventIds.has(event.id)) {
      errors.push(`events[${index}] repeats the id ${event.id}.`);
    }

    eventIds.add(event.id);
  }

  for (const [index, edge] of (input.edges as unknown[]).entries()) {
    if (
      !isRecord(edge) ||
      typeof edge.fromEventId !== "string" ||
      typeof edge.toEventId !== "string" ||
      !eventIds.has(edge.toEventId)
    ) {
      errors.push(`edges[${index}] does not reference events in the capsule.`);
    }
  }

  const rootEventId = (execution as { rootEventId?: unknown }).rootEventId;

  if (typeof rootEventId === "string" && !eventIds.has(rootEventId)) {
    errors.push("execution.rootEventId is not one of the capsule events.");
  }

  const integrity = input.integrity;

  if (
    !isRecord(integrity) ||
    integrity.algorithm !== "sha256" ||
    typeof integrity.digest !== "string"
  ) {
    errors.push("integrity must carry a sha256 digest.");
  }

  if (errors.length > 0) {
    return {
      errors,
    };
  }

  // Everything except id and integrity is covered by the digest.
  const { id, integrity: claimed, ...body } = input as Capsule;

  const digest = computeCapsuleDigest(body);

  if (digest !== claimed.digest) {
    return {
      errors: [
        "Integrity check failed: the capsule was modified after it was exported.",
      ],
    };
  }

  if (id !== `cap_${digest.slice(0, 16)}`) {
    return {
      errors: ["The capsule id does not match its digest."],
    };
  }

  return {
    capsule: input as Capsule,
  };
}
