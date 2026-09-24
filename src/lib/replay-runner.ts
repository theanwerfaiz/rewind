import db from "@/lib/db";
import {
  buildFixtures,
  isDependencyMode,
  type DependencyMode,
  type ReplayPlan,
} from "@/lib/dependency-replay";
import { getEventsByExecutionId } from "@/lib/events";
import { getSettings } from "@/lib/settings";
import { createExecutionId } from "@/lib/execution-context";
import {
  applyMutations,
  getDependencyMutations,
  parseMutations,
  type Mutation,
} from "@/lib/mutations";

type EventRow = {
  id: string;
  timestamp: string;
  type: string;
  title: string;
  status: string;
  duration: string | null;
  source: string | null;
  metadata: string | null;
  payload: string | null;
  execution_id: string | null;
};

const MAX_LABEL_LENGTH = 120;

const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];

const REDACTED_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
]);

const SKIPPED_REPLAY_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
]);

function parseJson(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isAllowedReplayUrl(url: URL) {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getCapturedHeaders(metadata: unknown) {
  if (!isObject(metadata)) {
    return {};
  }

  const headers = metadata.headers;

  if (!isObject(headers)) {
    return {};
  }

  const replayHeaders: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const normalizedKey = key.toLowerCase();

    if (REDACTED_HEADERS.has(normalizedKey)) {
      continue;
    }

    if (SKIPPED_REPLAY_HEADERS.has(normalizedKey)) {
      continue;
    }

    // Rewind's own replay headers are regenerated for every replay; a
    // captured copy (from replaying a replay) must not leak through.
    if (normalizedKey.startsWith("x-rewind-")) {
      continue;
    }

    if (typeof value !== "string") {
      continue;
    }

    if (value === "[REDACTED]") {
      continue;
    }

    replayHeaders[key] = value;
  }

  return replayHeaders;
}

function createReplayId() {
  return `replay_${crypto.randomUUID()}`;
}

function persistReplayPlan(plan: ReplayPlan) {
  db.prepare(
    `
    INSERT INTO replay_plans (
      replay_id,
      mode,
      fixtures,
      dependency_mutations,
      created_at
    )
    VALUES (?, ?, ?, ?, ?)
    `,
  ).run(
    plan.replayId,
    plan.mode,
    JSON.stringify(plan.fixtures),
    JSON.stringify(plan.dependencyMutations),
    new Date().toISOString(),
  );
}

function persistReplay({
  id,
  label,
  mutations,
  dependencyMode,
  sourceExecutionId,
  resultExecutionId,
  eventId,
  method,
  url,
  status,
  duration,
  payload,
  responseBody,
  responseHeaders,
}: {
  id: string;
  label: string | null;
  mutations: Mutation[];
  dependencyMode: DependencyMode;
  sourceExecutionId: string | null;
  resultExecutionId: string | null;
  eventId: string;
  method: string;
  url: string;
  status: number;
  duration: string;
  payload: unknown;
  responseBody: unknown;
  responseHeaders: Record<string, string>;
}) {
  const now = new Date().toISOString();

  db.prepare(
    `
      INSERT INTO replays (
        id,
        event_id,
        timestamp,
        method,
        url,
        status,
        duration,
        payload,
        response_body,
        response_headers,
        created_at,
        label,
        mutations,
        source_execution_id,
        result_execution_id,
        dependency_mode
      )
      VALUES (
        @id,
        @eventId,
        @timestamp,
        @method,
        @url,
        @status,
        @duration,
        @payload,
        @responseBody,
        @responseHeaders,
        @createdAt,
        @label,
        @mutations,
        @sourceExecutionId,
        @resultExecutionId,
        @dependencyMode
      )
    `,
  ).run({
    id,
    label,
    mutations: JSON.stringify(mutations),
    dependencyMode,
    sourceExecutionId,
    resultExecutionId,
    eventId,
    timestamp: now,
    method,
    url,
    status,
    duration,
    payload: payload === undefined ? null : JSON.stringify(payload),
    responseBody:
      responseBody === undefined ? null : JSON.stringify(responseBody),
    responseHeaders: JSON.stringify(responseHeaders),
    createdAt: now,
  });
}

export type ReplayRunResult = {
  status: number;
  body: Record<string, unknown>;
};

export type ReplayRunOptions = {
  /**
   * Where the replayed request is sent. Defaults to REWIND_REPLAY_BASE_URL.
   * Replays are restricted to localhost either way.
   */
  baseUrl?: string;
};

function respond(
  body: Record<string, unknown>,
  init: { status?: number } = {},
): ReplayRunResult {
  return {
    status: init.status ?? 200,
    body,
  };
}

/**
 * Replays a captured request, optionally as an experiment with mutations,
 * and stores the result. Used by POST /api/replay and by verification runs.
 */
export async function runReplay(
  body: unknown,
  options: ReplayRunOptions = {},
): Promise<ReplayRunResult> {
  try {
    if (!isObject(body)) {
      return respond(
        {
          error: "Request body must be a JSON object.",
        },
        {
          status: 400,
        },
      );
    }

    const eventId = body.eventId;

    if (typeof eventId !== "string" || eventId.trim().length === 0) {
      return respond(
        {
          error: "eventId is required.",
        },
        {
          status: 400,
        },
      );
    }

    const parsedMutations = parseMutations(body.mutations);

    if ("error" in parsedMutations) {
      return respond(
        {
          error: parsedMutations.error,
        },
        {
          status: 400,
        },
      );
    }

    const { mutations } = parsedMutations;

    if (
      body.label !== undefined &&
      body.label !== null &&
      (typeof body.label !== "string" || body.label.length > MAX_LABEL_LENGTH)
    ) {
      return respond(
        {
          error: `label must be a string of at most ${MAX_LABEL_LENGTH} characters.`,
        },
        {
          status: 400,
        },
      );
    }

    const label =
      typeof body.label === "string" && body.label.trim()
        ? body.label.trim()
        : null;

    if (
      body.dependencyMode !== undefined &&
      !isDependencyMode(body.dependencyMode)
    ) {
      return respond(
        {
          error: 'dependencyMode must be "recorded", "blocked", or "live".',
        },
        {
          status: 400,
        },
      );
    }

    // Safe by default: dependencies answer from the recording (or are
    // blocked, per the workspace setting) unless the experiment explicitly
    // opts into live calls.
    const dependencyMode: DependencyMode = isDependencyMode(body.dependencyMode)
      ? body.dependencyMode
      : getSettings().defaultDependencyMode;

    const event = db
      .prepare(
        `
        SELECT
          id,
          timestamp,
          type,
          title,
          status,
          duration,
          source,
          metadata,
          payload,
          execution_id
        FROM events
        WHERE id = ?
        `,
      )
      .get(eventId) as EventRow | undefined;

    if (!event) {
      return respond(
        {
          error: "Event not found.",
        },
        {
          status: 404,
        },
      );
    }

    const replayableTypes = ["http.request", "webhook.received"];

    if (!replayableTypes.includes(event.type)) {
      return respond(
        {
          error: "This event type cannot be replayed right now.",
        },
        {
          status: 400,
        },
      );
    }

    const metadata = parseJson(event.metadata);

    const method =
      isObject(metadata) && typeof metadata.method === "string"
        ? metadata.method.toUpperCase()
        : "POST";

    if (!ALLOWED_METHODS.includes(method)) {
      return respond(
        {
          error: `HTTP method "${method}" is not supported for replay.`,
        },
        {
          status: 400,
        },
      );
    }

    const path =
      isObject(metadata) && typeof metadata.path === "string"
        ? metadata.path
        : null;

    if (!path || !path.startsWith("/")) {
      return respond(
        {
          error: "Event does not contain a valid request path.",
        },
        {
          status: 400,
        },
      );
    }

    const baseUrl =
      options.baseUrl ??
      process.env.REWIND_REPLAY_BASE_URL ??
      "http://localhost:3000";

    let replayUrl: URL;

    try {
      replayUrl = new URL(path, baseUrl);
    } catch {
      return respond(
        {
          error: "Event contains an invalid replay URL.",
        },
        {
          status: 400,
        },
      );
    }

    if (!isAllowedReplayUrl(replayUrl)) {
      return respond(
        {
          error: "Replay is restricted to localhost.",
        },
        {
          status: 400,
        },
      );
    }

    const originalPayload = parseJson(event.payload);

    const hasPayloadOverride = Object.prototype.hasOwnProperty.call(
      body,
      "payload",
    );

    const basePayload = hasPayloadOverride ? body.payload : originalPayload;

    // Mutations apply to a copy; the captured event is never modified.
    const mutated = applyMutations(
      {
        url: replayUrl,
        headers: getCapturedHeaders(metadata),
        payload: basePayload,
      },
      mutations,
    );

    replayUrl = mutated.url;

    if (!isAllowedReplayUrl(replayUrl)) {
      return respond(
        {
          error: "Replay is restricted to localhost.",
        },
        {
          status: 400,
        },
      );
    }

    const replayPayload = mutated.payload;

    const replayId = createReplayId();

    // Pre-assign the execution the replayed request will be captured as, so
    // the experiment can be compared with the original execution.
    const resultExecutionId = createExecutionId();

    persistReplayPlan({
      replayId,
      mode: dependencyMode,
      fixtures: event.execution_id
        ? buildFixtures(getEventsByExecutionId(event.execution_id))
        : [],
      dependencyMutations: getDependencyMutations(mutations),
    });

    const replayHeaders: Record<string, string> = {
      ...mutated.headers,

      "X-Rewind-Replay": "true",

      "X-Rewind-Original-Event": event.id,

      "X-Rewind-Replay-Id": replayId,

      "X-Rewind-Execution-Id": resultExecutionId,
    };

    const hasRequestBody =
      method !== "GET" &&
      method !== "HEAD" &&
      replayPayload !== undefined &&
      replayPayload !== null;

    if (
      hasRequestBody &&
      !Object.keys(replayHeaders).some(
        (key) => key.toLowerCase() === "content-type",
      )
    ) {
      replayHeaders["Content-Type"] = "application/json";
    }

    const startTime = performance.now();

    let replayResponse: Response;

    try {
      replayResponse = await fetch(replayUrl.toString(), {
        method,

        headers: replayHeaders,

        body: hasRequestBody ? JSON.stringify(replayPayload) : undefined,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to reach the replay target.";

      console.error("Replay target unavailable:", error);

      return respond(
        {
          error: `Could not reach the local replay target. ${message}`,

          eventId: event.id,

          url: replayUrl.toString(),
        },
        {
          status: 502,
        },
      );
    }

    const durationMs = Math.round(performance.now() - startTime);

    const responseText = await replayResponse.text();

    let responseBody: unknown = responseText;

    try {
      responseBody = JSON.parse(responseText);
    } catch {
      // Keep plain text response.
    }

    const responseHeaders: Record<string, string> = {};

    replayResponse.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const capturedExecution = db
      .prepare(`SELECT 1 FROM executions WHERE id = ?`)
      .get(resultExecutionId);

    persistReplay({
      id: replayId,
      label,
      mutations,
      dependencyMode,
      sourceExecutionId: event.execution_id,
      resultExecutionId: capturedExecution ? resultExecutionId : null,
      eventId: event.id,
      method,
      url: replayUrl.toString(),
      status: replayResponse.status,
      duration: `${durationMs}ms`,
      payload: replayPayload,
      responseBody,
      responseHeaders,
    });

    return respond({
      success: replayResponse.ok,

      replay: {
        id: replayId,

        label,

        mutations,

        dependencyMode,

        sourceExecutionId: event.execution_id,

        resultExecutionId: capturedExecution ? resultExecutionId : null,

        eventId: event.id,

        eventType: event.type,

        url: replayUrl.toString(),

        method,

        status: replayResponse.status,

        statusText: replayResponse.statusText,

        duration: `${durationMs}ms`,

        headers: replayHeaders,

        body: responseBody,

        payload: replayPayload,
      },
    });
  } catch (error) {
    console.error("Unexpected replay error:", error);

    return respond(
      {
        error:
          error instanceof Error ? error.message : "Unexpected replay error.",
      },
      {
        status: 500,
      },
    );
  }
}
