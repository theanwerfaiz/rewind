import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NextRequest } from "next/server";

import { POST as login } from "@/app/api/auth/login/route";
import {
  MAX_FAILURES_PER_WINDOW,
  resetFailures,
  SESSION_COOKIE,
  sessionValue,
} from "@/lib/access";
import { BodyTooLargeError, readJsonBody } from "@/lib/request-body";
import { proxy } from "@/proxy";

const TOKEN = "s3cret-token-for-tests";

function request(path: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return new NextRequest(`http://localhost:3000${path}`, init);
}

beforeEach(() => {
  resetFailures();
});

afterEach(() => {
  delete process.env.REWIND_ACCESS_TOKEN;
  resetFailures();
});

describe("proxy without an access token", () => {
  it("lets every request through, as before", () => {
    const response = proxy(request("/api/executions"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects oversized bodies with 413 before the route runs", async () => {
    const response = proxy(
      request("/api/events", {
        method: "POST",
        headers: { "content-length": String(50 * 1024 * 1024) },
      }),
    );

    expect(response.status).toBe(413);
  });
});

describe("proxy with REWIND_ACCESS_TOKEN", () => {
  beforeEach(() => {
    process.env.REWIND_ACCESS_TOKEN = TOKEN;
  });

  it("answers 401 to an API call without credentials", () => {
    expect(proxy(request("/api/executions")).status).toBe(401);
  });

  it("redirects a page to /login and keeps where it was going", () => {
    const response = proxy(request("/executions?q=is%3Afailed"));

    expect(response.status).toBe(307);

    const location = new URL(response.headers.get("location")!);

    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/executions?q=is%3Afailed");
  });

  it("accepts the bearer token, the x-rewind-token header and the session cookie", () => {
    const variants: Record<string, string>[] = [
      { authorization: `Bearer ${TOKEN}` },
      { "x-rewind-token": TOKEN },
      { cookie: `${SESSION_COOKIE}=${sessionValue(TOKEN)}` },
    ];

    for (const headers of variants) {
      expect(proxy(request("/api/executions", { headers })).headers.get("x-middleware-next")).toBe(
        "1",
      );
    }
  });

  it("does not accept the raw token as a cookie", () => {
    expect(
      proxy(request("/api/executions", { headers: { cookie: `${SESSION_COOKIE}=${TOKEN}` } }))
        .status,
    ).toBe(401);
  });

  it("accepts ?token= only on the webhook capture route", () => {
    expect(
      proxy(request(`/api/webhooks/capture?token=${TOKEN}`, { method: "POST" })).headers.get(
        "x-middleware-next",
      ),
    ).toBe("1");

    expect(proxy(request(`/api/executions?token=${TOKEN}`)).status).toBe(401);
  });

  it("leaves the sign-in page and routes open", () => {
    expect(proxy(request("/login")).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(request("/api/auth/login", { method: "POST" })).headers.get("x-middleware-next")).toBe("1");
  });

  it("rate limits repeated wrong tokens", () => {
    for (let attempt = 0; attempt < MAX_FAILURES_PER_WINDOW; attempt += 1) {
      expect(
        proxy(request("/api/executions", { headers: { authorization: "Bearer wrong" } })).status,
      ).toBe(401);
    }

    // Even the right token waits out the window.
    expect(
      proxy(request("/api/executions", { headers: { authorization: `Bearer ${TOKEN}` } })).status,
    ).toBe(429);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    process.env.REWIND_ACCESS_TOKEN = TOKEN;
  });

  it("sets an httpOnly session cookie derived from the token", async () => {
    const response = await login(
      request("/api/auth/login", { method: "POST", body: JSON.stringify({ token: TOKEN }) }),
    );

    expect(response.status).toBe(200);

    const cookie = response.headers.get("set-cookie") ?? "";

    expect(cookie).toContain(`${SESSION_COOKIE}=${sessionValue(TOKEN)}`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie).not.toContain(TOKEN);
  });

  it("rejects a wrong token and then rate limits", async () => {
    for (let attempt = 0; attempt < MAX_FAILURES_PER_WINDOW; attempt += 1) {
      const response = await login(
        request("/api/auth/login", { method: "POST", body: JSON.stringify({ token: "nope" }) }),
      );

      expect(response.status).toBe(401);
    }

    const blocked = await login(
      request("/api/auth/login", { method: "POST", body: JSON.stringify({ token: TOKEN }) }),
    );

    expect(blocked.status).toBe(429);
  });
});

describe("readJsonBody", () => {
  it("parses JSON like request.json()", async () => {
    expect(await readJsonBody(request("/x", { method: "POST", body: '{"a":1}' }))).toEqual({ a: 1 });

    await expect(
      readJsonBody(request("/x", { method: "POST", body: "{bad" })),
    ).rejects.toBeInstanceOf(SyntaxError);
  });

  it("stops reading a body over the limit, even without a Content-Length", async () => {
    const chunk = new TextEncoder().encode("x".repeat(1024));

    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
    });

    const streamed = new Request("http://localhost/x", {
      method: "POST",
      body: stream,
      // @ts-expect-error Node's fetch needs this for a streamed body.
      duplex: "half",
    });

    await expect(readJsonBody(streamed, 10 * 1024)).rejects.toBeInstanceOf(BodyTooLargeError);
  });
});
