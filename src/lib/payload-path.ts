/**
 * Dot-path helpers for request payloads (`items.0.price`), shared by the
 * server and the Replay Lab in the browser. Pure: no Node-only imports.
 */

const FORBIDDEN_PATH_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePath(path: unknown) {
  if (typeof path !== "string" || path.trim() === "") {
    return null;
  }

  const segments = path.split(".");

  if (
    segments.length > 32 ||
    segments.some(
      (segment) => segment === "" || FORBIDDEN_PATH_KEYS.has(segment),
    )
  ) {
    return null;
  }

  return segments;
}

export function setPath(root: unknown, segments: string[], value: unknown) {
  const base: Record<string, unknown> | unknown[] =
    isRecord(root) || Array.isArray(root) ? root : {};

  let current: Record<string, unknown> | unknown[] = base;

  for (const [index, segment] of segments.entries()) {
    const isLast = index === segments.length - 1;

    const container = current as Record<string, unknown>;

    if (isLast) {
      container[segment] = value;
      break;
    }

    const next = container[segment];

    if (isRecord(next) || Array.isArray(next)) {
      current = next;
    } else {
      const created: Record<string, unknown> | unknown[] = /^\d+$/.test(
        segments[index + 1],
      )
        ? []
        : {};

      container[segment] = created;
      current = created;
    }
  }

  return base;
}

export function removePath(root: unknown, segments: string[]) {
  let current: unknown = root;

  for (const segment of segments.slice(0, -1)) {
    if (!isRecord(current) && !Array.isArray(current)) {
      return root;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  const last = segments[segments.length - 1];

  if (Array.isArray(current) && /^\d+$/.test(last)) {
    current.splice(Number(last), 1);
  } else if (isRecord(current)) {
    delete current[last];
  }

  return root;
}

export type PayloadMutation =
  | { target: "payload"; op: "set"; path: string; value: unknown }
  | { target: "payload"; op: "remove"; path: string };

/** Applies payload mutations in order to a deep copy of the payload. */
export function applyPayloadMutations(
  payload: unknown,
  mutations: PayloadMutation[],
): unknown {
  let result: unknown =
    payload === undefined ? undefined : structuredClone(payload);

  for (const mutation of mutations) {
    const segments = parsePath(mutation.path);

    if (!segments) {
      continue;
    }

    result =
      mutation.op === "set"
        ? setPath(result, segments, structuredClone(mutation.value))
        : removePath(result, segments);
  }

  return result;
}

function isValidSegment(segment: string) {
  return (
    segment !== "" && !segment.includes(".") && !FORBIDDEN_PATH_KEYS.has(segment)
  );
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => deepEqual(item, right[index]))
    );
  }

  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);

    return (
      leftKeys.length === Object.keys(right).length &&
      leftKeys.every(
        (key) => Object.hasOwn(right, key) && deepEqual(left[key], right[key]),
      )
    );
  }

  return false;
}

/**
 * Turns an edited payload into the smallest list of payload mutations that
 * reproduces it from the original, so an experiment edited as raw JSON is
 * still stored as explicit, reviewable changes.
 *
 * Arrays whose length changed, and objects with keys a path cannot name,
 * are replaced whole. The top level itself cannot be replaced.
 */
export function payloadMutationsFromEdit(
  original: unknown,
  edited: unknown,
): { mutations: PayloadMutation[] } | { error: string } {
  const mutations: PayloadMutation[] = [];

  function visit(before: unknown, after: unknown, segments: string[]): boolean {
    if (deepEqual(before, after)) {
      return true;
    }

    const canDescend = segments.length < 31;

    if (isRecord(before) && isRecord(after) && canDescend) {
      const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

      if ([...keys].every(isValidSegment)) {
        for (const key of Object.keys(before)) {
          if (!Object.hasOwn(after, key)) {
            mutations.push({
              target: "payload",
              op: "remove",
              path: [...segments, key].join("."),
            });
          }
        }

        for (const key of Object.keys(after)) {
          if (!visit(before[key], after[key], [...segments, key])) {
            return false;
          }
        }

        return true;
      }
    }

    if (
      Array.isArray(before) &&
      Array.isArray(after) &&
      before.length === after.length &&
      canDescend
    ) {
      return after.every((item, index) =>
        visit(before[index], item, [...segments, String(index)]),
      );
    }

    if (segments.length === 0) {
      return false;
    }

    mutations.push({
      target: "payload",
      op: "set",
      path: segments.join("."),
      value: after,
    });

    return true;
  }

  if (!visit(original, edited, [])) {
    return {
      error:
        "The top level of the payload cannot be replaced; edit the fields inside it.",
    };
  }

  return { mutations };
}
