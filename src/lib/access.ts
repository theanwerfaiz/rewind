import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Optional access control. Rewind is open by default, for local use. When
 * REWIND_ACCESS_TOKEN is set, every page and API needs the token: capture
 * clients and the CLI send it as a bearer token, and people sign in once
 * at /login, which stores a cookie derived from (never equal to) it.
 */

export const SESSION_COOKIE = "rewind_session";

/** Token from the environment, or null when access control is off. */
export function getAccessToken(): string | null {
  const token = process.env.REWIND_ACCESS_TOKEN?.trim();

  return token ? token : null;
}

export function sessionValue(token: string) {
  return createHash("sha256").update(`rewind-session:${token}`).digest("hex");
}

export function safeEqual(left: string, right: string) {
  const a = createHash("sha256").update(left).digest();

  const b = createHash("sha256").update(right).digest();

  // Hashing first gives equal lengths, so the comparison time does not
  // reveal the token's length either.
  return timingSafeEqual(a, b) && left === right;
}

/** The credential a request presents, if any: header or session cookie. */
export function presentedCredential(request: {
  headers: Headers;
  cookies: { get(name: string): { value: string } | undefined };
}): { kind: "token" | "session"; value: string } | null {
  const authorization = request.headers.get("authorization");

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return { kind: "token", value: authorization.slice(7).trim() };
  }

  const header = request.headers.get("x-rewind-token");

  if (header) {
    return { kind: "token", value: header.trim() };
  }

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;

  return cookie ? { kind: "session", value: cookie } : null;
}

export function isValidCredential(
  credential: { kind: "token" | "session"; value: string },
  token: string,
) {
  return credential.kind === "token"
    ? safeEqual(credential.value, token)
    : safeEqual(credential.value, sessionValue(token));
}

/**
 * Failed attempts per client in a sliding minute. In memory and per
 * process, which is enough to make guessing a token impractical.
 */
const WINDOW_MS = 60_000;

export const MAX_FAILURES_PER_WINDOW = 10;

const failures = new Map<string, number[]>();

export function clientKey(headers: Headers) {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "local"
  );
}

function recent(key: string, now: number) {
  const times = (failures.get(key) ?? []).filter((time) => now - time < WINDOW_MS);

  if (times.length === 0) {
    failures.delete(key);
  } else {
    failures.set(key, times);
  }

  return times;
}

export function isRateLimited(key: string, now = Date.now()) {
  return recent(key, now).length >= MAX_FAILURES_PER_WINDOW;
}

export function recordFailure(key: string, now = Date.now()) {
  failures.set(key, [...recent(key, now), now]);
}

/** For tests. */
export function resetFailures() {
  failures.clear();
}
