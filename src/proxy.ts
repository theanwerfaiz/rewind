import { NextResponse, type NextRequest } from "next/server";

import {
  clientKey,
  getAccessToken,
  isRateLimited,
  isValidCredential,
  presentedCredential,
  recordFailure,
} from "@/lib/access";
import { maxBodyBytesFor } from "@/lib/request-body";

/** Reachable without signing in, so people can sign in. */
// /api/health reveals only the version, and container checks cannot sign in.
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/health",
]);

/**
 * Runs before every page and API route:
 * 1. rejects request bodies over the size limit (413);
 * 2. when REWIND_ACCESS_TOKEN is set, requires the token or a session.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const declared = Number(request.headers.get("content-length"));

  if (
    pathname.startsWith("/api/") &&
    Number.isFinite(declared) &&
    declared > maxBodyBytesFor(pathname)
  ) {
    return NextResponse.json(
      { error: "Request body is too large." },
      { status: 413 },
    );
  }

  const token = getAccessToken();

  if (!token || PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const key = clientKey(request.headers);

  if (isRateLimited(key)) {
    return NextResponse.json(
      { error: "Too many failed attempts. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  // Webhook senders cannot add headers, so this one route also accepts
  // ?token=; the route redacts it before storing the path.
  const queryToken =
    pathname === "/api/webhooks/capture"
      ? request.nextUrl.searchParams.get("token")
      : null;

  const credential =
    presentedCredential(request) ??
    (queryToken ? { kind: "token" as const, value: queryToken } : null);

  if (credential && isValidCredential(credential, token)) {
    return NextResponse.next();
  }

  if (credential) {
    recordFailure(key);
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="rewind"' } },
    );
  }

  const login = new URL("/login", request.url);

  login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);

  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's own assets and the icon.
  matcher: ["/((?!_next/static|_next/image|icon.svg|robots.txt).*)"],
};
