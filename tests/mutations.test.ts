import { describe, expect, it } from "vitest";

import {
  applyMutations,
  describeMutation,
  MAX_MUTATIONS,
  parseMutations,
  type Mutation,
  type ReplayRequest,
} from "@/lib/mutations";

function request(overrides: Partial<ReplayRequest> = {}): ReplayRequest {
  return {
    url: new URL("http://localhost:3000/api/checkout?currency=usd"),
    headers: {
      "content-type": "application/json",
      "x-feature": "on",
    },
    payload: {
      userId: "user_1",
      amount: 4999,
      items: [
        {
          sku: "A",
          price: 10,
        },
      ],
    },
    ...overrides,
  };
}

function parsed(input: unknown) {
  const result = parseMutations(input);

  if ("error" in result) {
    throw new Error(result.error);
  }

  return result.mutations;
}

describe("parseMutations", () => {
  it("treats a missing list as no mutations", () => {
    expect(parseMutations(undefined)).toEqual({
      mutations: [],
    });
  });

  it("accepts every supported mutation shape", () => {
    const input = [
      { target: "payload", op: "set", path: "amount", value: 0 },
      { target: "payload", op: "remove", path: "userId" },
      { target: "header", op: "set", name: "x-feature", value: "off" },
      { target: "header", op: "remove", name: "x-feature" },
      { target: "query", op: "set", name: "currency", value: "eur" },
      { target: "query", op: "remove", name: "currency" },
    ];

    expect(parsed(input)).toEqual(input);
  });

  it("drops unknown properties", () => {
    expect(
      parsed([
        {
          target: "payload",
          op: "remove",
          path: "amount",
          extra: true,
        },
      ]),
    ).toEqual([
      {
        target: "payload",
        op: "remove",
        path: "amount",
      },
    ]);
  });

  it.each([
    ["a non-array", { target: "payload" }, "must be an array"],
    ["a non-object entry", ["x"], "must be an object"],
    [
      "an unknown op",
      [{ target: "payload", op: "merge", path: "a" }],
      'op must be "set" or "remove"',
    ],
    [
      "an unknown target",
      [{ target: "cookie", op: "set", name: "a", value: "b" }],
      "target must be",
    ],
    [
      "an empty path",
      [{ target: "payload", op: "remove", path: "" }],
      "path must be",
    ],
    [
      "an empty path segment",
      [{ target: "payload", op: "remove", path: "a..b" }],
      "path must be",
    ],
    [
      "a __proto__ path",
      [{ target: "payload", op: "set", path: "__proto__.polluted", value: 1 }],
      "path must be",
    ],
    [
      "a constructor path",
      [{ target: "payload", op: "set", path: "a.constructor", value: 1 }],
      "path must be",
    ],
    [
      "a payload set without a value",
      [{ target: "payload", op: "set", path: "a" }],
      "a value is required",
    ],
    [
      "an invalid header name",
      [{ target: "header", op: "set", name: "bad header", value: "x" }],
      "valid header name",
    ],
    [
      "a non-string header value",
      [{ target: "header", op: "set", name: "x-a", value: 1 }],
      "values must be strings",
    ],
    [
      "the authorization header",
      [{ target: "header", op: "set", name: "Authorization", value: "x" }],
      "cannot be changed",
    ],
    [
      "the cookie header",
      [{ target: "header", op: "remove", name: "cookie" }],
      "cannot be changed",
    ],
    [
      "a Rewind replay header",
      [
        {
          target: "header",
          op: "set",
          name: "X-Rewind-Execution-Id",
          value: "x",
        },
      ],
      "cannot be changed",
    ],
    [
      "the host header",
      [{ target: "header", op: "set", name: "host", value: "evil.test" }],
      "cannot be changed",
    ],
  ])("rejects %s", (_label, input, message) => {
    const result = parseMutations(input);

    expect("error" in result && result.error).toContain(message);
  });

  it("limits the number of mutations", () => {
    const input = Array.from({ length: MAX_MUTATIONS + 1 }, () => ({
      target: "payload",
      op: "remove",
      path: "a",
    }));

    expect("error" in parseMutations(input)).toBe(true);
  });
});

describe("applyMutations", () => {
  it("never modifies the original request", () => {
    const original = request();

    const snapshot = structuredClone({
      url: original.url.toString(),
      headers: original.headers,
      payload: original.payload,
    });

    applyMutations(
      original,
      parsed([
        { target: "payload", op: "set", path: "items.0.price", value: 0 },
        { target: "payload", op: "remove", path: "userId" },
        { target: "header", op: "remove", name: "x-feature" },
        { target: "query", op: "set", name: "currency", value: "eur" },
      ]),
    );

    expect({
      url: original.url.toString(),
      headers: original.headers,
      payload: original.payload,
    }).toEqual(snapshot);
  });

  it("sets and removes payload fields, including nested and array paths", () => {
    const result = applyMutations(
      request(),
      parsed([
        { target: "payload", op: "set", path: "amount", value: 0 },
        { target: "payload", op: "set", path: "items.0.price", value: 99 },
        { target: "payload", op: "set", path: "meta.retry.count", value: 3 },
        { target: "payload", op: "set", path: "tags.0", value: "vip" },
        { target: "payload", op: "remove", path: "userId" },
      ]),
    );

    expect(result.payload).toEqual({
      amount: 0,
      items: [
        {
          sku: "A",
          price: 99,
        },
      ],
      meta: {
        retry: {
          count: 3,
        },
      },
      tags: ["vip"],
    });
  });

  it("removes array elements by index", () => {
    const result = applyMutations(
      request({
        payload: {
          items: ["a", "b", "c"],
        },
      }),
      parsed([{ target: "payload", op: "remove", path: "items.1" }]),
    );

    expect(result.payload).toEqual({
      items: ["a", "c"],
    });
  });

  it("creates a payload when the original had none", () => {
    const result = applyMutations(
      request({
        payload: undefined,
      }),
      parsed([{ target: "payload", op: "set", path: "amount", value: 1 }]),
    );

    expect(result.payload).toEqual({
      amount: 1,
    });
  });

  it("ignores removing a path that does not exist", () => {
    const result = applyMutations(
      request(),
      parsed([{ target: "payload", op: "remove", path: "nope.deeper" }]),
    );

    expect(result.payload).toEqual(request().payload);
  });

  it("replaces headers case-insensitively", () => {
    const result = applyMutations(
      request(),
      parsed([
        { target: "header", op: "set", name: "X-Feature", value: "off" },
        { target: "header", op: "set", name: "x-new", value: "1" },
        { target: "header", op: "remove", name: "Content-Type" },
      ]),
    );

    expect(result.headers).toEqual({
      "X-Feature": "off",
      "x-new": "1",
    });
  });

  it("sets and removes query parameters without changing the host", () => {
    const result = applyMutations(
      request(),
      parsed([
        { target: "query", op: "set", name: "retry", value: "true" },
        { target: "query", op: "remove", name: "currency" },
      ]),
    );

    expect(result.url.toString()).toBe(
      "http://localhost:3000/api/checkout?retry=true",
    );
  });

  it("applies mutations in order", () => {
    const result = applyMutations(
      request(),
      parsed([
        { target: "payload", op: "set", path: "amount", value: 1 },
        { target: "payload", op: "set", path: "amount", value: 2 },
      ]),
    );

    expect((result.payload as { amount: number }).amount).toBe(2);
  });
});

describe("describeMutation", () => {
  it.each<[Mutation, string]>([
    [
      { target: "payload", op: "set", path: "amount", value: 0 },
      "payload.amount = 0",
    ],
    [
      { target: "payload", op: "remove", path: "userId" },
      "remove payload.userId",
    ],
    [
      { target: "header", op: "set", name: "x-flag", value: "off" },
      'header.x-flag = "off"',
    ],
    [{ target: "query", op: "remove", name: "page" }, "remove query.page"],
  ])("describes %j", (mutation, expected) => {
    expect(describeMutation(mutation)).toBe(expected);
  });
});
