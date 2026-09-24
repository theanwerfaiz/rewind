import db from "@/lib/db";
import { REDACTED, REDACTED_HEADERS } from "@/lib/redaction";

/**
 * Workspace settings stored in SQLite. Redaction settings only ever add to
 * the built-in rules: nothing here can make Rewind store a credential that
 * it would otherwise redact.
 */
export type Settings = {
  /** Header names redacted on ingest, in addition to the built-in list. */
  extraRedactedHeaders: string[];
  /** JSON field names redacted on ingest at any depth, case-insensitive. */
  extraRedactedFields: string[];
  /**
   * Dependency mode for experiments that do not choose one. "live" is not
   * allowed as a default: re-sending payments or emails must be explicit.
   */
  defaultDependencyMode: "recorded" | "blocked";
};

export const DEFAULT_SETTINGS: Settings = {
  extraRedactedHeaders: [],
  extraRedactedFields: [],
  defaultDependencyMode: "recorded",
};

const MAX_NAMES = 50;

const HEADER_NAME = /^[a-z0-9!#$%&'*+.^_`|~-]{1,128}$/;

const FIELD_NAME = /^[A-Za-z0-9_$-]{1,64}$/;

function readRow(key: keyof Settings): unknown {
  const row = db
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .get(key) as { value: string } | undefined;

  if (!row) {
    return undefined;
  }

  try {
    return JSON.parse(row.value);
  } catch {
    return undefined;
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function getSettings(): Settings {
  const headers = readRow("extraRedactedHeaders");

  const fields = readRow("extraRedactedFields");

  const mode = readRow("defaultDependencyMode");

  return {
    extraRedactedHeaders: isStringArray(headers)
      ? headers
      : DEFAULT_SETTINGS.extraRedactedHeaders,
    extraRedactedFields: isStringArray(fields)
      ? fields
      : DEFAULT_SETTINGS.extraRedactedFields,
    defaultDependencyMode:
      mode === "blocked" || mode === "recorded"
        ? mode
        : DEFAULT_SETTINGS.defaultDependencyMode,
  };
}

function normalizeNames(
  input: unknown,
  pattern: RegExp,
  label: string,
  lowercase: boolean,
): { names: string[] } | { error: string } {
  if (!isStringArray(input)) {
    return { error: `${label} must be a list of names.` };
  }

  const names = [
    ...new Set(
      input
        .map((name) => name.trim())
        .filter((name) => name !== "")
        .map((name) => (lowercase ? name.toLowerCase() : name)),
    ),
  ];

  if (names.length > MAX_NAMES) {
    return { error: `${label}: at most ${MAX_NAMES} names.` };
  }

  const invalid = names.find((name) => !pattern.test(name));

  if (invalid !== undefined) {
    return { error: `${label}: "${invalid}" is not a valid name.` };
  }

  return { names };
}

/** Validates and stores a partial update; returns the new settings. */
export function updateSettings(
  input: unknown,
): { settings: Settings } | { error: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { error: "Settings must be an object." };
  }

  const patch = input as Record<string, unknown>;

  const updates: Partial<Settings> = {};

  if (patch.extraRedactedHeaders !== undefined) {
    const result = normalizeNames(
      patch.extraRedactedHeaders,
      HEADER_NAME,
      "Redacted headers",
      true,
    );

    if ("error" in result) {
      return result;
    }

    // Built-in headers are always redacted; listing them again is noise.
    updates.extraRedactedHeaders = result.names.filter(
      (name) => !REDACTED_HEADERS.has(name),
    );
  }

  if (patch.extraRedactedFields !== undefined) {
    const result = normalizeNames(
      patch.extraRedactedFields,
      FIELD_NAME,
      "Redacted fields",
      false,
    );

    if ("error" in result) {
      return result;
    }

    updates.extraRedactedFields = result.names;
  }

  if (patch.defaultDependencyMode !== undefined) {
    if (
      patch.defaultDependencyMode !== "recorded" &&
      patch.defaultDependencyMode !== "blocked"
    ) {
      return {
        error: 'Default dependency mode must be "recorded" or "blocked".',
      };
    }

    updates.defaultDependencyMode = patch.defaultDependencyMode;
  }

  const now = new Date().toISOString();

  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);

  db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      upsert.run(key, JSON.stringify(value), now);
    }
  })();

  return { settings: getSettings() };
}

function redactHeaderRecord(value: unknown, names: Set<string>) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      names.has(key.toLowerCase()) ? REDACTED : item,
    ]),
  );
}

function redactFields(value: unknown, names: Set<string>, depth = 0): unknown {
  if (depth > 32) {
    return REDACTED;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactFields(item, names, depth + 1));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        names.has(key.toLowerCase())
          ? REDACTED
          : redactFields(item, names, depth + 1),
      ]),
    );
  }

  return value;
}

/**
 * Applies the workspace's extra redaction to an incoming event before it
 * is stored: request and response headers in metadata, and named fields in
 * the payload and response body.
 */
export function applyIngestRedaction(
  event: { metadata?: unknown; payload?: unknown },
  settings: Settings = getSettings(),
): { metadata?: unknown; payload?: unknown } {
  const headers = new Set(settings.extraRedactedHeaders);

  const fields = new Set(
    settings.extraRedactedFields.map((name) => name.toLowerCase()),
  );

  if (headers.size === 0 && fields.size === 0) {
    return event;
  }

  let metadata = event.metadata;

  if (typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)) {
    const record = { ...(metadata as Record<string, unknown>) };

    if (record.headers !== undefined) {
      record.headers = redactHeaderRecord(record.headers, headers);
    }

    const response = record.response;

    if (typeof response === "object" && response !== null && !Array.isArray(response)) {
      const responseRecord = { ...(response as Record<string, unknown>) };

      if (responseRecord.headers !== undefined) {
        responseRecord.headers = redactHeaderRecord(responseRecord.headers, headers);
      }

      if (fields.size > 0 && responseRecord.body !== undefined) {
        responseRecord.body = redactFields(responseRecord.body, fields);
      }

      record.response = responseRecord;
    }

    metadata = record;
  }

  return {
    metadata,
    payload:
      fields.size > 0 && event.payload !== undefined
        ? redactFields(event.payload, fields)
        : event.payload,
  };
}
