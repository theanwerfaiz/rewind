import { NextRequest, NextResponse } from "next/server";

import {
  clientKey,
  getAccessToken,
  isRateLimited,
  recordFailure,
  safeEqual,
  SESSION_COOKIE,
  sessionValue,
} from "@/lib/access";
import { readJsonBody } from "@/lib/request-body";

export const runtime = "nodejs";

/** Exchanges the access token for a session cookie. */
export async function POST(request: NextRequest) {
  const token = getAccessToken();

  if (!token) {
    return NextResponse.json({ ok: true, protected: false });
  }

  const key = clientKey(request.headers);

  if (isRateLimited(key)) {
    return NextResponse.json(
      { error: "Too many failed attempts. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const body = (await readJsonBody(request, 4096).catch(() => null)) as {
    token?: unknown;
  } | null;

  if (typeof body?.token !== "string" || !safeEqual(body.token.trim(), token)) {
    recordFailure(key);

    return NextResponse.json({ error: "That token is not correct." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, protected: true });

  response.cookies.set(SESSION_COOKIE, sessionValue(token), {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
