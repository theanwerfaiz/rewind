import { afterEach, describe, expect, it, vi } from "vitest";

import { runInExecution } from "@/lib/execution-context";
import { redactJson, redactUrl } from "@/lib/redaction";
import { rewind } from "@/lib/rewind";
import { MAX_RECORDED_BODY_BYTES, rewindFetch } from "@/lib/rewind-fetch";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockCapture() {
  return vi.spyOn(rewind, "capture").mockResolvedValue({
    id: "evt_dependency",
    timestamp: "2026-09-01T00:00:00.000Z",
    type: "http.dependency",
    title: "dependency",
    status: "success",
  });
}

function mockDependency(response: () => Response | Promise<Response>) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => response());
}

describe("rewindFetch", () => {
  it("records a dependency call and returns the response untouched", async () => {
    const captureMock = mockCapture();

    mockDependency(() =>
      Response.json(
        {
          id: "ch_1",
          paid: true,
        },
        {
          status: 201,
        },
      ),
    );

    const response = await rewindFetch(
      "https://api.stripe.test/v1/charges?expand=customer",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          amount: 4999,
        }),
      },
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "ch_1",
      paid: true,
    });

    expect(captureMock).toHaveBeenCalledTimes(1);

    const event = captureMock.mock.calls[0][0];

    expect(event).toMatchObject({
      type: "http.dependency",
      title: "POST https://api.stripe.test/v1/charges",
      status: "success",
      source: "rewind-fetch",
      payload: {
        amount: 4999,
      },
      metadata: {
        dependency: {
          kind: "http",
          mode: "live",
          method: "POST",
          url: "https://api.stripe.test/v1/charges?expand=customer",
          host: "api.stripe.test",
        },
        response: {
          status: 201,
          body: {
            id: "ch_1",
            paid: true,
          },
          truncated: false,
        },
      },
    });

    expect(event.duration).toMatch(/^\d+ms$/);
    expect(Date.parse(String(event.timestamp))).not.toBeNaN();
  });

  it("redacts credentials in headers, query strings and JSON bodies", async () => {
    const captureMock = mockCapture();

    mockDependency(() =>
      Response.json({
        access_token: "tok_live_secret",
        user: {
          password: "hunter2",
          name: "Ada",
        },
      }),
    );

    await rewindFetch("https://api.example.test/login?api_key=abc123&page=2", {
      method: "POST",
      headers: {
        authorization: "Bearer secret",
        "content-type": "application/json",
        "x-trace": "keep-me",
      },
      body: JSON.stringify({
        username: "ada",
        password: "hunter2",
        card: {
          cardNumber: "4242424242424242",
        },
      }),
    });

    const event = captureMock.mock.calls[0][0];

    const serialised = JSON.stringify(event);

    for (const secret of [
      "Bearer secret",
      "abc123",
      "hunter2",
      "tok_live_secret",
      "4242424242424242",
    ]) {
      expect(serialised).not.toContain(secret);
    }

    expect(event.metadata).toMatchObject({
      dependency: {
        url: "https://api.example.test/login?api_key=%5BREDACTED%5D&page=2",
      },
      headers: {
        authorization: "[REDACTED]",
        "x-trace": "keep-me",
      },
    });

    expect(event.payload).toEqual({
      username: "ada",
      password: "[REDACTED]",
      card: {
        cardNumber: "[REDACTED]",
      },
    });
  });

  it("marks 5xx dependency responses as errors", async () => {
    const captureMock = mockCapture();

    mockDependency(() => new Response("upstream down", { status: 503 }));

    const response = await rewindFetch("https://api.example.test/health");

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("upstream down");

    expect(captureMock.mock.calls[0][0]).toMatchObject({
      status: "error",
      metadata: {
        response: {
          status: 503,
          body: "upstream down",
        },
      },
    });
  });

  it("keeps 4xx dependency responses as successful calls", async () => {
    const captureMock = mockCapture();

    mockDependency(() => new Response("missing", { status: 404 }));

    await rewindFetch("https://api.example.test/users/1");

    expect(captureMock.mock.calls[0][0].status).toBe("success");
  });

  it("records network failures and rethrows the original error", async () => {
    const captureMock = mockCapture();

    const networkError = new TypeError("fetch failed");

    vi.spyOn(globalThis, "fetch").mockRejectedValue(networkError);

    await expect(rewindFetch("https://api.example.test/")).rejects.toBe(
      networkError,
    );

    expect(captureMock.mock.calls[0][0]).toMatchObject({
      status: "error",
      metadata: {
        error: "fetch failed",
      },
    });
  });

  it("truncates large bodies but still returns the whole body", async () => {
    const captureMock = mockCapture();

    const large = "x".repeat(MAX_RECORDED_BODY_BYTES + 1000);

    mockDependency(
      () =>
        new Response(large, {
          headers: {
            "content-type": "text/plain",
          },
        }),
    );

    const response = await rewindFetch("https://api.example.test/export");

    expect(await response.text()).toHaveLength(large.length);

    const recorded = captureMock.mock.calls[0][0].metadata as {
      response: { body: string; sizeBytes: number; truncated: boolean };
    };

    expect(recorded.response.truncated).toBe(true);
    expect(recorded.response.body).toHaveLength(MAX_RECORDED_BODY_BYTES);
    expect(recorded.response.sizeBytes).toBeGreaterThan(
      MAX_RECORDED_BODY_BYTES,
    );
  });

  it("does not buffer streaming responses", async () => {
    const captureMock = mockCapture();

    mockDependency(
      () =>
        new Response("data: hello\n\n", {
          headers: {
            "content-type": "text/event-stream",
          },
        }),
    );

    const response = await rewindFetch("https://api.example.test/stream");

    expect(await response.text()).toBe("data: hello\n\n");

    const metadata = captureMock.mock.calls[0][0].metadata as {
      response: Record<string, unknown>;
    };

    expect(metadata.response.body).toBeUndefined();
  });

  it("does not break the call when recording fails", async () => {
    vi.spyOn(rewind, "capture").mockRejectedValue(new Error("Rewind down"));

    vi.spyOn(console, "error").mockImplementation(() => {});

    mockDependency(() => new Response("ok"));

    const response = await rewindFetch("https://api.example.test/");

    expect(await response.text()).toBe("ok");
  });

  it("records the dependency as a child of the current execution", async () => {
    const captured: Record<string, unknown>[] = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);

      if (url.endsWith("/api/events")) {
        captured.push(JSON.parse(String(init?.body)));

        return Response.json({ event: {} }, { status: 201 });
      }

      return new Response("ok");
    });

    await runInExecution(
      {
        executionId: "exe_parent",
        eventId: "evt_parent",
      },
      () => rewindFetch("https://api.example.test/"),
    );

    expect(captured).toHaveLength(1);

    expect(captured[0]).toMatchObject({
      type: "http.dependency",
      executionId: "exe_parent",
      parentEventId: "evt_parent",
    });
  });
});

describe("redaction helpers", () => {
  it("redacts nested credential fields and leaves others", () => {
    expect(
      redactJson({
        apiKey: "k",
        nested: [
          {
            client_secret: "s",
            id: 1,
          },
        ],
        name: "n",
      }),
    ).toEqual({
      apiKey: "[REDACTED]",
      nested: [
        {
          client_secret: "[REDACTED]",
          id: 1,
        },
      ],
      name: "n",
    });
  });

  it("strips credentials embedded in a URL", () => {
    expect(redactUrl("https://user:pass@api.example.test/x")).toBe(
      "https://api.example.test/x",
    );
  });

  it("redacts signed URL parameters", () => {
    expect(
      redactUrl("https://bucket.test/file?X-Amz-Signature=abc&sig=def&v=1"),
    ).toBe(
      "https://bucket.test/file?X-Amz-Signature=%5BREDACTED%5D&sig=%5BREDACTED%5D&v=1",
    );
  });
});
