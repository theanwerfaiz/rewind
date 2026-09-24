import { getCapsuleImports } from "@/lib/capsule-store";
import db from "@/lib/db";
import { searchExecutions } from "@/lib/executions";
import { getFingerprints } from "@/lib/fingerprints";
import { getIncidents } from "@/lib/incidents";

export type SearchResultKind =
  | "execution"
  | "failure"
  | "event"
  | "replay"
  | "capsule"
  | "incident";

export type SearchResult = {
  kind: SearchResultKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  status: "success" | "error" | null;
};

const MAX_QUERY_LENGTH = 200;

/** Escapes LIKE wildcards; IDs contain underscores. Use with ESCAPE '\'. */
export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function toStatus(value: string | null | undefined) {
  return value === "error" ? "error" : value === "success" ? "success" : null;
}

/**
 * Finds executions, failures, events, replays and capsules for the command
 * palette. An ID or ID prefix (exe_, evt_, fp_, replay_, cap_, inc_) jumps to
 * that record; other text matches titles, messages and labels.
 */
export function search(rawQuery: string, limit = 6): SearchResult[] {
  const query = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);

  if (query === "") {
    return [];
  }

  const lower = query.toLowerCase();

  const prefix = `${escapeLike(query)}%`;

  const contains = `%${escapeLike(query)}%`;

  const results: SearchResult[] = [];

  for (const execution of searchExecutions(prefix, contains, limit)) {
    results.push({
      kind: "execution",
      id: execution.id,
      title: execution.rootTitle ?? execution.id,
      subtitle: `${execution.id}${execution.isReplay ? " · replay" : ""}`,
      href: `/executions/${execution.id}`,
      status: toStatus(execution.status),
    });
  }

  const failures = getFingerprints(500).filter(
    (fingerprint) =>
      fingerprint.id.toLowerCase().startsWith(lower) ||
      fingerprint.signature.message.toLowerCase().includes(lower) ||
      fingerprint.signature.endpoint.toLowerCase().includes(lower),
  );

  for (const fingerprint of failures.slice(0, limit)) {
    results.push({
      kind: "failure",
      id: fingerprint.id,
      title: fingerprint.signature.message,
      subtitle: `${fingerprint.signature.endpoint} · ${fingerprint.count}×`,
      href: `/fingerprints/${fingerprint.id}`,
      status: "error",
    });
  }

  // Events are only found by ID: their titles already surface through
  // executions, and the events table is the largest.
  if (/^evt_/i.test(query)) {
    const events = db
      .prepare(
        `
        SELECT id, title, type, status
        FROM events
        WHERE id LIKE ? ESCAPE '\\'
        ORDER BY timestamp DESC
        LIMIT ?
        `,
      )
      .all(prefix, limit) as {
      id: string;
      title: string;
      type: string;
      status: string;
    }[];

    for (const event of events) {
      results.push({
        kind: "event",
        id: event.id,
        title: event.title,
        subtitle: `${event.id} · ${event.type}`,
        href: `/events/${event.id}`,
        status: toStatus(event.status),
      });
    }
  }

  const replays = db
    .prepare(
      `
      SELECT id, label, method, url, status
      FROM replays
      WHERE id LIKE ? ESCAPE '\\'
        OR label LIKE ? ESCAPE '\\'
      ORDER BY created_at DESC
      LIMIT ?
      `,
    )
    .all(prefix, contains, limit) as {
    id: string;
    label: string | null;
    method: string;
    url: string;
    status: number;
  }[];

  for (const replay of replays) {
    results.push({
      kind: "replay",
      id: replay.id,
      title: replay.label ?? `${replay.method} ${replay.url}`,
      subtitle: `${replay.id} · HTTP ${replay.status}`,
      href: `/replays/${replay.id}`,
      status: replay.status >= 400 ? "error" : "success",
    });
  }

  const capsules = getCapsuleImports(200).filter(
    (capsule) =>
      capsule.id.toLowerCase().startsWith(lower) ||
      (capsule.rootTitle ?? "").toLowerCase().includes(lower),
  );

  for (const capsule of capsules.slice(0, limit)) {
    results.push({
      kind: "capsule",
      id: capsule.id,
      title: capsule.rootTitle ?? capsule.id,
      subtitle: `${capsule.id} · imported`,
      href: `/executions/${capsule.executionId}`,
      status: toStatus(capsule.status),
    });
  }

  const incidents = getIncidents(200).filter(
    (incident) =>
      incident.id.toLowerCase().startsWith(lower) ||
      incident.title.toLowerCase().includes(lower),
  );

  for (const incident of incidents.slice(0, limit)) {
    results.push({
      kind: "incident",
      id: incident.id,
      title: incident.title,
      subtitle: `${incident.status} · ${incident.executionCount} ${
        incident.executionCount === 1 ? "execution" : "executions"
      }`,
      href: `/incidents/${incident.id}`,
      status: incident.status === "open" ? "error" : "success",
    });
  }

  return results;
}
