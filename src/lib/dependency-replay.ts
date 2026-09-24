import { normalizeEndpoint } from "./fingerprint";
import { REDACTED_HEADERS } from "./redaction";

/**
 * How a replay treats outgoing dependency calls made through rewindFetch.
 *
 * - recorded: answer each call with the response recorded in the original
 *   execution; calls with no recording are blocked (never sent live)
 * - blocked: fail every call
 * - live: send calls to the real dependency (explicit opt-in)
 */
export type DependencyMode = "recorded" | "blocked" | "live";

export const DEPENDENCY_MODES: DependencyMode[] = [
  "recorded",
  "blocked",
  "live",
];

export const DEFAULT_DEPENDENCY_MODE: DependencyMode = "recorded";

export type DependencyFixture = {
  /** Normalised dependency title, e.g. "POST https://api.test/v1/charges". */
  key: string;
  title: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  /** The recording was cut at the size limit and cannot be replayed. */
  truncated: boolean;
};

export type DependencyOverride = {
  status?: number;
  body?: unknown;
  delayMs?: number;
};

export type DependencyMutation =
  | {
      target: "dependency";
      op: "set";
      match: string;
      override: DependencyOverride;
    }
  | {
      target: "dependency";
      op: "remove";
      match: string;
    };

export type ReplayPlan = {
  replayId: string;
  mode: DependencyMode;
  fixtures: DependencyFixture[];
  dependencyMutations: DependencyMutation[];
};

export const MAX_DEPENDENCY_DELAY_MS = 30_000;

export function dependencyKey(title: string) {
  return normalizeEndpoint(title);
}

export function isDependencyMode(value: unknown): value is DependencyMode {
  return (
    typeof value === "string" && (DEPENDENCY_MODES as string[]).includes(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Builds replay fixtures from the dependency events of the original
 * execution, in the order the calls were made.
 */
export function buildFixtures(
  events: {
    type: string;
    title: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
  }[],
): DependencyFixture[] {
  return events
    .filter((event) => event.type === "http.dependency")
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
    .flatMap((event) => {
      const response = isRecord(event.metadata?.response)
        ? event.metadata.response
        : undefined;

      if (!response || typeof response.status !== "number") {
        // The original call failed at the network level; nothing to replay.
        return [];
      }

      return [
        {
          key: dependencyKey(event.title),
          title: event.title,
          status: response.status,
          statusText:
            typeof response.statusText === "string" ? response.statusText : "",
          headers: isRecord(response.headers)
            ? (Object.fromEntries(
                Object.entries(response.headers).filter(
                  ([, value]) => typeof value === "string",
                ),
              ) as Record<string, string>)
            : {},
          body: response.body,
          truncated: response.truncated === true,
        },
      ];
    });
}

/** Thrown for dependency calls a replay does not allow to happen. */
export class DependencyBlockedError extends TypeError {
  constructor(title: string, reason: string) {
    super(`Rewind replay blocked ${title}: ${reason}`);
    this.name = "DependencyBlockedError";
  }
}

/** Headers that must not be copied onto a synthesised response. */
const UNREPLAYABLE_HEADERS = new Set([
  ...REDACTED_HEADERS,
  "content-length",
  "content-encoding",
  "transfer-encoding",
  "connection",
]);

function buildResponse(
  status: number,
  statusText: string,
  headers: Record<string, string>,
  body: unknown,
) {
  const responseHeaders = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (!UNREPLAYABLE_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  }

  let text: string | null = null;

  if (typeof body === "string") {
    text = body;
  } else if (body !== undefined) {
    text = JSON.stringify(body);

    if (!responseHeaders.has("content-type")) {
      responseHeaders.set("content-type", "application/json");
    }
  }

  // Responses with these statuses cannot carry a body.
  const bodyless = status === 204 || status === 205 || status === 304;

  return new Response(bodyless ? null : text, {
    status,
    statusText,
    headers: responseHeaders,
  });
}

export type DependencyDecision =
  | {
      kind: "live";
    }
  | {
      kind: "respond";
      mode: "recorded" | "mutated";
      delayMs: number;
      response: Response;
    }
  | {
      kind: "fail";
      mode: "blocked" | "mutated";
      error: DependencyBlockedError;
    };

/**
 * Per-execution replay state. Recorded responses are consumed in order,
 * so the second call to an endpoint gets the second recorded response.
 */
export class DependencyReplayer {
  private readonly queues = new Map<string, DependencyFixture[]>();

  constructor(private readonly plan: ReplayPlan) {
    for (const fixture of plan.fixtures) {
      this.queues.set(fixture.key, [
        ...(this.queues.get(fixture.key) ?? []),
        fixture,
      ]);
    }
  }

  get mode() {
    return this.plan.mode;
  }

  decide(title: string): DependencyDecision {
    const key = dependencyKey(title);

    const fixture = this.queues.get(key)?.shift();

    const mutation = this.plan.dependencyMutations.find(
      (candidate) => dependencyKey(candidate.match) === key,
    );

    if (mutation?.op === "remove") {
      return {
        kind: "fail",
        mode: "mutated",
        error: new DependencyBlockedError(
          title,
          "made unavailable by experiment",
        ),
      };
    }

    if (mutation?.op === "set") {
      const { override } = mutation;

      return {
        kind: "respond",
        mode: "mutated",
        delayMs: Math.min(override.delayMs ?? 0, MAX_DEPENDENCY_DELAY_MS),
        response: buildResponse(
          override.status ?? fixture?.status ?? 200,
          override.status === undefined ? (fixture?.statusText ?? "") : "",
          fixture?.headers ?? {},
          "body" in override ? override.body : fixture?.body,
        ),
      };
    }

    if (this.plan.mode === "live") {
      return {
        kind: "live",
      };
    }

    if (this.plan.mode === "recorded" && fixture && !fixture.truncated) {
      return {
        kind: "respond",
        mode: "recorded",
        delayMs: 0,
        response: buildResponse(
          fixture.status,
          fixture.statusText,
          fixture.headers,
          fixture.body,
        ),
      };
    }

    return {
      kind: "fail",
      mode: "blocked",
      error: new DependencyBlockedError(
        title,
        this.plan.mode === "blocked"
          ? "dependencies are blocked in this replay"
          : fixture?.truncated
            ? "the recorded response was truncated"
            : "no recorded response for this call",
      ),
    };
  }
}
