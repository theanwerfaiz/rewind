/**
 * Default redaction applied before captured data is stored. Rewind should
 * never become the place a secret leaks from.
 */

export const REDACTED = "[REDACTED]";

export const REDACTED_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "proxy-authorization",
]);

/** Query parameter and JSON field names that usually hold credentials. */
const SENSITIVE_NAME =
  /pass(word)?|secret|token|api[-_]?key|auth|signature|^sig$|credential|private[-_]?key|cvc|cvv|card[-_]?number/i;

export function isSensitiveName(name: string) {
  return SENSITIVE_NAME.test(name);
}

export function redactHeaders(headers: Headers) {
  const result: Record<string, string> = {};

  headers.forEach((value, key) => {
    result[key] = REDACTED_HEADERS.has(key.toLowerCase()) ? REDACTED : value;
  });

  return result;
}

/**
 * Removes credentials embedded in a URL (user:pass@) and redacts query
 * parameters whose names look like credentials.
 */
export function redactUrl(value: string | URL) {
  const url = new URL(value);

  url.username = "";
  url.password = "";

  for (const key of [...url.searchParams.keys()]) {
    if (isSensitiveName(key)) {
      url.searchParams.set(key, REDACTED);
    }
  }

  return url.toString();
}

/**
 * Returns a copy of a JSON value with credential-like fields redacted at
 * any depth.
 */
export function redactJson(value: unknown, depth = 0): unknown {
  if (depth > 32) {
    return REDACTED;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactJson(item, depth + 1));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        isSensitiveName(key) ? REDACTED : redactJson(item, depth + 1),
      ]),
    );
  }

  return value;
}
