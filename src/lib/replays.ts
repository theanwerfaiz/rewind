import db from "@/lib/db";
import type { DependencyMode } from "@/lib/dependency-replay";
import type { Mutation } from "@/lib/mutations";

export type Replay = {
  id: string;
  eventId: string;
  timestamp: string;
  method: string;
  url: string;
  status: number;
  duration: string;
  payload: unknown;
  responseBody: unknown;
  responseHeaders: unknown;
  createdAt: string;

  label: string | null;
  mutations: Mutation[];
  sourceExecutionId: string | null;
  resultExecutionId: string | null;
  dependencyMode: DependencyMode | null;
};

type ReplayRow = {
  id: string;
  event_id: string;
  timestamp: string;
  method: string;
  url: string;
  status: number;
  duration: string;
  payload: string | null;
  response_body: string | null;
  response_headers: string | null;
  created_at: string;
  label: string | null;
  mutations: string | null;
  source_execution_id: string | null;
  result_execution_id: string | null;
  dependency_mode: DependencyMode | null;
};

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

function serializeReplay(row: ReplayRow): Replay {
  return {
    id: row.id,
    eventId: row.event_id,
    timestamp: row.timestamp,
    method: row.method,
    url: row.url,
    status: row.status,
    duration: row.duration,
    payload: parseJson(row.payload),
    responseBody: parseJson(row.response_body),
    responseHeaders: parseJson(row.response_headers),
    createdAt: row.created_at,

    label: row.label,
    mutations: (parseJson(row.mutations) as Mutation[] | null) ?? [],
    sourceExecutionId: row.source_execution_id,
    resultExecutionId: row.result_execution_id,
    dependencyMode: row.dependency_mode,
  };
}

export function getReplaysForEvent(eventId: string): Replay[] {
  const rows = db
    .prepare(
      `
      SELECT
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
      FROM replays
      WHERE event_id = ?
      ORDER BY created_at DESC
      `,
    )
    .all(eventId) as ReplayRow[];

  return rows.map(serializeReplay);
}

export function getReplayById(replayId: string): Replay | null {
  const row = db
    .prepare(
      `
      SELECT
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
      FROM replays
      WHERE id = ?
      `,
    )
    .get(replayId) as ReplayRow | undefined;

  if (!row) {
    return null;
  }

  return serializeReplay(row);
}

/**
 * The replay that produced an execution, if the execution came from one.
 */
export function getReplayByResultExecutionId(executionId: string) {
  const row = db
    .prepare(
      `
      SELECT
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
      FROM replays
      WHERE result_execution_id = ?
      `,
    )
    .get(executionId) as ReplayRow | undefined;

  return row ? serializeReplay(row) : null;
}

export type ExperimentSummary = Replay & {
  /** Title of the captured request the experiment replayed. */
  eventTitle: string | null;
};

/** The newest experiments across every captured request. */
export function getRecentExperiments(limit = 20): ExperimentSummary[] {
  const rows = db
    .prepare(
      `
      SELECT
        replays.id,
        replays.event_id,
        replays.timestamp,
        replays.method,
        replays.url,
        replays.status,
        replays.duration,
        replays.payload,
        replays.response_body,
        replays.response_headers,
        replays.created_at,
        replays.label,
        replays.mutations,
        replays.source_execution_id,
        replays.result_execution_id,
        replays.dependency_mode,
        events.title AS event_title
      FROM replays
      LEFT JOIN events
        ON events.id = replays.event_id
      ORDER BY replays.created_at DESC
      LIMIT ?
      `,
    )
    .all(limit) as (ReplayRow & { event_title: string | null })[];

  return rows.map((row) => ({
    ...serializeReplay(row),
    eventTitle: row.event_title,
  }));
}
