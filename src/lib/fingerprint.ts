import { createHash } from "node:crypto";

import type { ExecutionGraph } from "./event-graph";
import type { RewindEvent } from "./mock-events";

/**
 * Bump when the normalisation or signature inputs change. Executions
 * fingerprinted by an older version are recomputed on read.
 */
export const FINGERPRINT_VERSION = 1;

export type FailureSignature = {
  /** Root endpoint with IDs replaced, e.g. "POST /api/users/:id". */
  endpoint: string;
  /** Type of the event where the failure originated. */
  originType: string;
  /** Normalised error message of the origin event. */
  message: string;
  /** HTTP status of the origin event, when it is an HTTP event. */
  status: number | null;
  /** Event types from the root to the origin, e.g. "http.request>error". */
  path: string;
};

export type FailureFingerprint = {
  id: string;
  signature: FailureSignature;
};

const MAX_MESSAGE_LENGTH = 200;

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

const PREFIXED_ID = /\b[a-z]{1,8}_[A-Za-z0-9_-]*\d[A-Za-z0-9_-]*\b/g;

const LONG_HEX = /\b(?=[0-9a-f]*\d)[0-9a-f]{8,}\b/gi;

const EMAIL = /\b[^\s@]+@[^\s@]+\.[a-z]{2,}\b/gi;

const QUOTED = /"[^"]*"|'[^']*'|`[^`]*`/g;

const NUMBER = /\b\d+(?:\.\d+)?(?:ms|s|kb|mb|gb|b)?\b/gi;

/**
 * Removes the parts of an error message that vary between occurrences of
 * the same failure: IDs, numbers, quoted values, emails.
 */
export function normalizeMessage(message: string) {
  return message
    .replace(UUID, "<uuid>")
    .replace(EMAIL, "<email>")
    .replace(QUOTED, "<str>")
    .replace(PREFIXED_ID, "<id>")
    .replace(LONG_HEX, "<hex>")
    .replace(NUMBER, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, MAX_MESSAGE_LENGTH);
}

function isIdSegment(segment: string) {
  return (
    /^\d+$/.test(segment) ||
    new RegExp(`^${UUID.source}$`, "i").test(segment) ||
    /^(?=[0-9a-f]*\d)[0-9a-f]{8,}$/i.test(segment) ||
    /^[a-z]{1,8}_[A-Za-z0-9_-]*\d[A-Za-z0-9_-]*$/.test(segment)
  );
}

/**
 * Normalises an event title such as "GET /api/users/42?x=1" into
 * "GET /api/users/:id". Titles that are not "METHOD /path" are returned
 * with their message normalised.
 */
export function normalizeEndpoint(title: string) {
  const match = title.match(/^([A-Z]+)\s+((?:https?:\/\/[^/\s]+)?)(\/\S*)$/);

  if (!match) {
    return normalizeMessage(title);
  }

  const [, method, origin, target] = match;

  const path = target
    .split(/[?#]/)[0]
    .split("/")
    .map((segment) => (isIdSegment(segment) ? ":id" : segment))
    .join("/");

  return `${method} ${origin.toLowerCase()}${path}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getOriginMessage(event: RewindEvent) {
  const metadata = isRecord(event.metadata) ? event.metadata : undefined;

  if (typeof metadata?.error === "string" && metadata.error) {
    return normalizeMessage(metadata.error);
  }

  // An HTTP event that failed by status alone is described by its endpoint;
  // the status itself is a separate part of the signature.
  if (event.type === "http.request" || event.type === "http.dependency") {
    return normalizeEndpoint(event.title);
  }

  return normalizeMessage(event.title);
}

function getHttpStatus(event: RewindEvent) {
  if (
    (event.type !== "http.request" && event.type !== "http.dependency") ||
    !isRecord(event.metadata)
  ) {
    return null;
  }

  const response = event.metadata.response;

  return isRecord(response) && typeof response.status === "number"
    ? response.status
    : null;
}

/**
 * Computes the fingerprint of a failed execution from its graph. Returns
 * null when the execution has no failure.
 *
 * The same failure recurring with different IDs, amounts, or timings maps
 * to the same fingerprint; a different endpoint, origin, message shape,
 * status, or failure path maps to a different one.
 */
export function computeFailureFingerprint(
  graph: ExecutionGraph,
): FailureFingerprint | null {
  if (!graph.firstFailureId) {
    return null;
  }

  const byId = new Map(graph.nodes.map((node) => [node.event.id, node.event]));

  const origin = byId.get(graph.firstFailureId);

  const root = byId.get(graph.failurePath[0] ?? graph.firstFailureId);

  if (!origin || !root) {
    return null;
  }

  const signature: FailureSignature = {
    endpoint: normalizeEndpoint(root.title),
    originType: origin.type,
    message: getOriginMessage(origin),
    status: getHttpStatus(origin),
    path: graph.failurePath
      .map((eventId) => byId.get(eventId)?.type ?? "?")
      .join(">"),
  };

  const hash = createHash("sha256")
    .update(
      JSON.stringify([
        FINGERPRINT_VERSION,
        signature.endpoint,
        signature.originType,
        signature.message,
        signature.status,
        signature.path,
      ]),
    )
    .digest("hex");

  return {
    id: `fp_${hash.slice(0, 16)}`,
    signature,
  };
}
