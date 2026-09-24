/**
 * Structured, reproducible mutations for Replay Lab experiments.
 *
 * Mutations are explicit data, stored with every experiment, and applied to
 * a copy of the captured request: the original is never modified.
 * Dependency mutations are not applied to the request; they travel to the
 * target application in the replay plan.
 */

import {
  MAX_DEPENDENCY_DELAY_MS,
  type DependencyMutation,
} from "./dependency-replay";
import { isRecord, parsePath, removePath, setPath } from "./payload-path";

export type Mutation =
  | {
      target: "payload";
      op: "set";
      path: string;
      value: unknown;
    }
  | {
      target: "payload";
      op: "remove";
      path: string;
    }
  | {
      target: "header" | "query";
      op: "set";
      name: string;
      value: string;
    }
  | {
      target: "header" | "query";
      op: "remove";
      name: string;
    }
  | DependencyMutation;

export type ReplayRequest = {
  url: URL;
  headers: Record<string, string>;
  payload: unknown;
};

export const MAX_MUTATIONS = 50;

/**
 * Headers an experiment may not set: credentials (so secrets are never
 * stored in experiment records), transport headers, and Rewind's own replay
 * headers.
 */
const PROTECTED_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "host",
  "content-length",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
]);

const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,128}$/;

function isProtectedHeader(name: string) {
  const lower = name.toLowerCase();

  return PROTECTED_HEADERS.has(lower) || lower.startsWith("x-rewind-");
}

/**
 * Validates untrusted mutation input. Returns the normalised mutations or
 * a message describing the first problem.
 */
export function parseMutations(
  input: unknown,
): { mutations: Mutation[] } | { error: string } {
  if (input === undefined || input === null) {
    return {
      mutations: [],
    };
  }

  if (!Array.isArray(input)) {
    return {
      error: "mutations must be an array.",
    };
  }

  if (input.length > MAX_MUTATIONS) {
    return {
      error: `At most ${MAX_MUTATIONS} mutations are allowed.`,
    };
  }

  const mutations: Mutation[] = [];

  for (const [index, raw] of input.entries()) {
    const label = `Mutation ${index + 1}`;

    if (!isRecord(raw)) {
      return {
        error: `${label} must be an object.`,
      };
    }

    const { target, op } = raw;

    if (op !== "set" && op !== "remove") {
      return {
        error: `${label}: op must be "set" or "remove".`,
      };
    }

    if (target === "payload") {
      if (!parsePath(raw.path)) {
        return {
          error: `${label}: path must be dot-separated keys, e.g. "items.0.price".`,
        };
      }

      if (op === "set" && !("value" in raw)) {
        return {
          error: `${label}: a value is required.`,
        };
      }

      mutations.push(
        op === "set"
          ? {
              target,
              op,
              path: raw.path as string,
              value: raw.value,
            }
          : {
              target,
              op,
              path: raw.path as string,
            },
      );

      continue;
    }

    if (target === "header" || target === "query") {
      const name = raw.name;

      if (
        typeof name !== "string" ||
        (target === "header" ? !HEADER_NAME.test(name) : name.length === 0)
      ) {
        return {
          error: `${label}: a valid ${target} name is required.`,
        };
      }

      if (target === "header" && isProtectedHeader(name)) {
        return {
          error: `${label}: the "${name}" header cannot be changed in an experiment.`,
        };
      }

      if (op === "set" && typeof raw.value !== "string") {
        return {
          error: `${label}: ${target} values must be strings.`,
        };
      }

      mutations.push(
        op === "set"
          ? {
              target,
              op,
              name,
              value: raw.value as string,
            }
          : {
              target,
              op,
              name,
            },
      );

      continue;
    }

    if (target === "dependency") {
      const match = raw.match;

      if (
        typeof match !== "string" ||
        match.trim() === "" ||
        match.length > 2048
      ) {
        return {
          error: `${label}: match must name a dependency, e.g. "POST https://api.example.com/v1/charges".`,
        };
      }

      if (op === "remove") {
        mutations.push({
          target,
          op,
          match: match.trim(),
        });

        continue;
      }

      const override = isRecord(raw.override) ? raw.override : undefined;

      if (!override) {
        return {
          error: `${label}: override must be an object with status, body, or delayMs.`,
        };
      }

      const { status, delayMs } = override;

      if (
        status !== undefined &&
        !(
          Number.isInteger(status) &&
          (status as number) >= 200 &&
          (status as number) <= 599
        )
      ) {
        return {
          error: `${label}: status must be an HTTP status between 200 and 599.`,
        };
      }

      if (
        delayMs !== undefined &&
        !(
          Number.isInteger(delayMs) &&
          (delayMs as number) >= 0 &&
          (delayMs as number) <= MAX_DEPENDENCY_DELAY_MS
        )
      ) {
        return {
          error: `${label}: delayMs must be between 0 and ${MAX_DEPENDENCY_DELAY_MS}.`,
        };
      }

      if (
        status === undefined &&
        delayMs === undefined &&
        !("body" in override)
      ) {
        return {
          error: `${label}: override must set status, body, or delayMs.`,
        };
      }

      mutations.push({
        target,
        op,
        match: match.trim(),
        override: {
          ...(status !== undefined ? { status: status as number } : {}),
          ...(delayMs !== undefined ? { delayMs: delayMs as number } : {}),
          ...("body" in override ? { body: override.body } : {}),
        },
      });

      continue;
    }

    return {
      error: `${label}: target must be "payload", "header", "query", or "dependency".`,
    };
  }

  return {
    mutations,
  };
}

/**
 * Applies mutations in order to a deep copy of the request.
 */
export function applyMutations(
  request: ReplayRequest,
  mutations: Mutation[],
): ReplayRequest {
  let payload: unknown =
    request.payload === undefined
      ? undefined
      : structuredClone(request.payload);

  const headers = {
    ...request.headers,
  };

  const url = new URL(request.url);

  for (const mutation of mutations) {
    if (mutation.target === "dependency") {
      continue;
    }

    if (mutation.target === "payload") {
      const segments = parsePath(mutation.path)!;

      payload =
        mutation.op === "set"
          ? setPath(payload, segments, structuredClone(mutation.value))
          : removePath(payload, segments);

      continue;
    }

    if (mutation.target === "header") {
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === mutation.name.toLowerCase()) {
          delete headers[key];
        }
      }

      if (mutation.op === "set") {
        headers[mutation.name] = mutation.value;
      }

      continue;
    }

    if (mutation.op === "set") {
      url.searchParams.set(mutation.name, mutation.value);
    } else {
      url.searchParams.delete(mutation.name);
    }
  }

  return {
    url,
    headers,
    payload,
  };
}

/**
 * A short human-readable form, e.g. `payload.amount = 0`.
 */
export function describeMutation(mutation: Mutation) {
  if (mutation.target === "dependency") {
    if (mutation.op === "remove") {
      return `${mutation.match} unavailable`;
    }

    const parts = [
      mutation.override.status !== undefined
        ? `status ${mutation.override.status}`
        : null,
      "body" in mutation.override ? "custom body" : null,
      mutation.override.delayMs ? `+${mutation.override.delayMs}ms` : null,
    ].filter(Boolean);

    return `${mutation.match} → ${parts.join(", ")}`;
  }

  const subject =
    mutation.target === "payload"
      ? `payload.${mutation.path}`
      : `${mutation.target}.${mutation.name}`;

  if (mutation.op === "remove") {
    return `remove ${subject}`;
  }

  return `${subject} = ${JSON.stringify(mutation.value)}`;
}

export function getDependencyMutations(mutations: Mutation[]) {
  return mutations.filter(
    (mutation): mutation is DependencyMutation =>
      mutation.target === "dependency",
  );
}
