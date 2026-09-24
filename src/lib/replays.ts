import db from "@/lib/db";
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
        result_execution_id
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
        result_execution_id
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
