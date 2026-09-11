import { describe, expect, it } from "vitest";

import { findReplayChanges } from "@/lib/replay-diff";

describe("findReplayChanges", () => {
  it("returns no changes for identical payloads", () => {
    const changes = findReplayChanges(
      {
        message: "hello",
        value: 42,
      },
      {
        message: "hello",
        value: 42,
      },
    );

    expect(changes).toEqual([]);
  });

  it("detects a changed primitive value", () => {
    const changes = findReplayChanges(
      {
        captured: true,
      },
      {
        captured: false,
      },
    );

    expect(changes).toEqual([
      {
        path: "captured",
        original: true,
        replay: false,
        type: "changed",
      },
    ]);
  });

  it("detects added fields", () => {
    const changes = findReplayChanges(
      {
        message: "hello",
      },
      {
        message: "hello",
        source: "replay",
      },
    );

    expect(changes).toEqual([
      {
        path: "source",
        original: undefined,
        replay: "replay",
        type: "added",
      },
    ]);
  });

  it("detects removed fields", () => {
    const changes = findReplayChanges(
      {
        message: "hello",
        source: "capture",
      },
      {
        message: "hello",
      },
    );

    expect(changes).toEqual([
      {
        path: "source",
        original: "capture",
        replay: undefined,
        type: "removed",
      },
    ]);
  });

  it("detects nested field changes", () => {
    const changes = findReplayChanges(
      {
        customer: {
          email: "old@example.com",
        },
      },
      {
        customer: {
          email: "new@example.com",
        },
      },
    );

    expect(changes).toEqual([
      {
        path: "customer.email",
        original: "old@example.com",
        replay: "new@example.com",
        type: "changed",
      },
    ]);
  });

  it("detects array item changes", () => {
    const changes = findReplayChanges(
      {
        items: [
          {
            quantity: 1,
          },
        ],
      },
      {
        items: [
          {
            quantity: 2,
          },
        ],
      },
    );

    expect(changes).toEqual([
      {
        path: "items[0].quantity",
        original: 1,
        replay: 2,
        type: "changed",
      },
    ]);
  });

  it("detects multiple changes", () => {
    const changes = findReplayChanges(
      {
        message: "hello",
        captured: true,
        count: 1,
      },
      {
        message: "goodbye",
        captured: false,
        count: 1,
      },
    );

    expect(changes).toHaveLength(2);

    expect(changes).toContainEqual({
      path: "message",
      original: "hello",
      replay: "goodbye",
      type: "changed",
    });

    expect(changes).toContainEqual({
      path: "captured",
      original: true,
      replay: false,
      type: "changed",
    });
  });
});
