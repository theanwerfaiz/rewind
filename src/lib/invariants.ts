import { normalizeEndpoint } from "./fingerprint";
import type { RewindEvent } from "./mock-events";

/**
 * Invariants are expected truths about an execution's behaviour, e.g.
 * "the checkout returns 200" or "the card is charged at most once". They
 * are attached to an execution and evaluated against any execution that
 * reproduces it, so a fix is only verified when behaviour is right, not
 * merely when the error is gone.
 */

export type InvariantDefinition =
  | {
      kind: "http_status";
      equals: number;
    }
  | {
      kind: "max_duration_ms";
      value: number;
    }
  | {
      kind: "response_field";
      path: string;
      equals: unknown;
    }
  | {
      kind: "event_exists";
      title: string;
    }
  | {
      kind: "event_absent";
      title: string;
    }
  | {
      kind: "max_event_count";
      title: string;
      max: number;
    }
  | {
      kind: "no_unhandled_errors";
    };

export type Invariant = InvariantDefinition & {
  id: string;
};

export type InvariantResult = {
  invariantId: string;
  passed: boolean;
  /** What was observed, e.g. "502" or "2 events". */
  actual: string;
};

export type InvariantSubject = {
  status: string;
  startedAt: string;
  endedAt: string;
  rootEventId: string | null;
  events: RewindEvent[];
};

const MAX_TITLE_LENGTH = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTitle(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    value.length <= MAX_TITLE_LENGTH
  );
}

/**
 * Validates an untrusted invariant definition.
 */
export function parseInvariant(
  input: unknown,
): { invariant: InvariantDefinition } | { error: string } {
  if (!isRecord(input)) {
    return {
      error: "An invariant must be an object.",
    };
  }

  switch (input.kind) {
    case "http_status":
      return Number.isInteger(input.equals) &&
        (input.equals as number) >= 100 &&
        (input.equals as number) <= 599
        ? {
            invariant: {
              kind: "http_status",
              equals: input.equals as number,
            },
          }
        : {
            error: "equals must be an HTTP status between 100 and 599.",
          };

    case "max_duration_ms":
      return Number.isInteger(input.value) && (input.value as number) > 0
        ? {
            invariant: {
              kind: "max_duration_ms",
              value: input.value as number,
            },
          }
        : {
            error: "value must be a positive number of milliseconds.",
          };

    case "response_field":
      if (
        typeof input.path !== "string" ||
        !/^[A-Za-z0-9_$-]+(\.[A-Za-z0-9_$-]+)*$/.test(input.path)
      ) {
        return {
          error: 'path must be dot-separated keys, e.g. "order.status".',
        };
      }

      if (!("equals" in input)) {
        return {
          error: "equals is required.",
        };
      }

      return {
        invariant: {
          kind: "response_field",
          path: input.path,
          equals: input.equals,
        },
      };

    case "event_exists":
    case "event_absent":
      return isTitle(input.title)
        ? {
            invariant: {
              kind: input.kind,
              title: input.title.trim(),
            },
          }
        : {
            error: "title must name an event.",
          };

    case "max_event_count":
      if (!isTitle(input.title)) {
        return {
          error: "title must name an event.",
        };
      }

      return Number.isInteger(input.max) && (input.max as number) >= 0
        ? {
            invariant: {
              kind: "max_event_count",
              title: input.title.trim(),
              max: input.max as number,
            },
          }
        : {
            error: "max must be a whole number of at least 0.",
          };

    case "no_unhandled_errors":
      return {
        invariant: {
          kind: "no_unhandled_errors",
        },
      };

    default:
      return {
        error:
          "kind must be one of http_status, max_duration_ms, response_field, event_exists, event_absent, max_event_count, no_unhandled_errors.",
      };
  }
}

/**
 * A human-readable statement of the invariant, e.g. `HTTP status is 200`.
 */
export function describeInvariant(invariant: InvariantDefinition) {
  switch (invariant.kind) {
    case "http_status":
      return `HTTP status is ${invariant.equals}`;

    case "max_duration_ms":
      return `Completes within ${invariant.value}ms`;

    case "response_field":
      return `response.${invariant.path} is ${JSON.stringify(invariant.equals)}`;

    case "event_exists":
      return `"${invariant.title}" happens`;

    case "event_absent":
      return `"${invariant.title}" never happens`;

    case "max_event_count":
      return `"${invariant.title}" happens at most ${invariant.max} ${
        invariant.max === 1 ? "time" : "times"
      }`;

    case "no_unhandled_errors":
      return "No unhandled errors";
  }
}

function getRoot(subject: InvariantSubject) {
  return subject.events.find((event) => event.id === subject.rootEventId);
}

function getResponse(event: RewindEvent | undefined) {
  const response = isRecord(event?.metadata)
    ? event.metadata.response
    : undefined;

  return isRecord(response) ? response : undefined;
}

function countMatching(subject: InvariantSubject, title: string) {
  const key = normalizeEndpoint(title);

  return subject.events.filter(
    (event) => normalizeEndpoint(event.title) === key,
  ).length;
}

function readPath(value: unknown, path: string) {
  let current = value;

  for (const key of path.split(".")) {
    if (Array.isArray(current) && /^\d+$/.test(key)) {
      current = current[Number(key)];
    } else if (isRecord(current) && Object.hasOwn(current, key)) {
      current = current[key];
    } else {
      return undefined;
    }
  }

  return current;
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function evaluateInvariant(
  invariant: Invariant,
  subject: InvariantSubject,
): InvariantResult {
  const result = (passed: boolean, actual: string): InvariantResult => ({
    invariantId: invariant.id,
    passed,
    actual,
  });

  switch (invariant.kind) {
    case "http_status": {
      const status = getResponse(getRoot(subject))?.status;

      return result(
        status === invariant.equals,
        typeof status === "number" ? String(status) : "no HTTP status",
      );
    }

    case "max_duration_ms": {
      const durationMs = Math.max(
        Date.parse(subject.endedAt) - Date.parse(subject.startedAt),
        0,
      );

      return result(durationMs <= invariant.value, `${durationMs}ms`);
    }

    case "response_field": {
      const value = readPath(
        getResponse(getRoot(subject))?.body,
        invariant.path,
      );

      return result(
        sameValue(value, invariant.equals),
        value === undefined ? "missing" : JSON.stringify(value),
      );
    }

    case "event_exists": {
      const count = countMatching(subject, invariant.title);

      return result(count > 0, `${count} ${count === 1 ? "event" : "events"}`);
    }

    case "event_absent": {
      const count = countMatching(subject, invariant.title);

      return result(
        count === 0,
        `${count} ${count === 1 ? "event" : "events"}`,
      );
    }

    case "max_event_count": {
      const count = countMatching(subject, invariant.title);

      return result(
        count <= invariant.max,
        `${count} ${count === 1 ? "event" : "events"}`,
      );
    }

    case "no_unhandled_errors":
      // The execution's status is its root outcome: handled child failures
      // do not count, a failed request does.
      return result(subject.status !== "error", subject.status);
  }
}

export function evaluateInvariants(
  invariants: Invariant[],
  subject: InvariantSubject,
) {
  return invariants.map((invariant) => evaluateInvariant(invariant, subject));
}
