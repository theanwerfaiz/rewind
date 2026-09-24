import { describe, expect, it } from "vitest";

import { buildExecutionGraph, type EventEdge } from "@/lib/event-graph";
import type { EventStatus, RewindEvent } from "@/lib/mock-events";

function event(
  id: string,
  timestamp: string,
  options: {
    parentEventId?: string | null;
    status?: EventStatus;
  } = {},
): RewindEvent {
  return {
    id,
    timestamp: `2026-09-01T10:00:00.${timestamp}Z`,
    type: "http.request",
    title: id,
    status: options.status ?? "success",
    executionId: "exe_test",
    parentEventId: options.parentEventId ?? null,
  };
}

function edge(fromEventId: string, toEventId: string): EventEdge {
  return {
    id: `edg_${fromEventId}_${toEventId}`,
    executionId: "exe_test",
    fromEventId,
    toEventId,
    type: "parent_of",
    origin: "explicit",
    confidence: 1,
    createdAt: "2026-09-01T10:00:01.000Z",
  };
}

function order(graph: ReturnType<typeof buildExecutionGraph>) {
  return graph.nodes.map((node) => [node.event.id, node.depth]);
}

describe("buildExecutionGraph", () => {
  it("returns an empty graph for no events", () => {
    expect(buildExecutionGraph([], [])).toEqual({
      nodes: [],
      rootIds: [],
      firstFailureId: null,
      failurePath: [],
    });
  });

  it("nests children under their parent in chronological order", () => {
    const events = [
      // Deliberately out of order, as rows arrive during capture.
      event("payment", "300", { parentEventId: "checkout" }),
      event("checkout", "000"),
      event("charge", "350", { parentEventId: "payment" }),
      event("cart", "100", { parentEventId: "checkout" }),
    ];

    const graph = buildExecutionGraph(events, [
      edge("checkout", "payment"),
      edge("payment", "charge"),
      edge("checkout", "cart"),
    ]);

    expect(order(graph)).toEqual([
      ["checkout", 0],
      ["cart", 1],
      ["payment", 1],
      ["charge", 2],
    ]);

    expect(graph.rootIds).toEqual(["checkout"]);

    expect(graph.nodes[0].childIds).toEqual(["cart", "payment"]);
  });

  it("orders multiple roots chronologically", () => {
    const graph = buildExecutionGraph(
      [event("b", "200"), event("a", "100"), event("c", "300")],
      [],
    );

    expect(graph.rootIds).toEqual(["a", "b", "c"]);
  });

  it("marks events whose parent was never captured as orphan roots", () => {
    const graph = buildExecutionGraph(
      [
        event("root", "000"),
        event("lost", "100", { parentEventId: "evt_missing" }),
      ],
      [edge("evt_missing", "lost")],
    );

    expect(graph.rootIds).toEqual(["root", "lost"]);

    expect(graph.nodes.find((node) => node.event.id === "lost")?.orphan).toBe(
      true,
    );

    expect(graph.nodes.find((node) => node.event.id === "root")?.orphan).toBe(
      false,
    );
  });

  it("ignores edges to events outside the execution", () => {
    const graph = buildExecutionGraph(
      [event("root", "000")],
      [edge("root", "evt_elsewhere")],
    );

    expect(graph.nodes[0].childIds).toEqual([]);
  });

  it("uses only the first parent edge for an event", () => {
    const graph = buildExecutionGraph(
      [event("a", "000"), event("b", "100"), event("child", "200")],
      [edge("a", "child"), edge("b", "child")],
    );

    expect(order(graph)).toEqual([
      ["a", 0],
      ["child", 1],
      ["b", 0],
    ]);
  });

  it("survives parent cycles without dropping or repeating events", () => {
    const graph = buildExecutionGraph(
      [
        event("x", "000", { parentEventId: "y" }),
        event("y", "100", { parentEventId: "x" }),
      ],
      [edge("y", "x"), edge("x", "y")],
    );

    expect(graph.nodes.map((node) => node.event.id).sort()).toEqual(["x", "y"]);

    expect(graph.rootIds).toHaveLength(1);
  });

  it("ignores self-referencing edges", () => {
    const graph = buildExecutionGraph([event("a", "000")], [edge("a", "a")]);

    expect(order(graph)).toEqual([["a", 0]]);
  });

  it("locates the failure origin below failed parents", () => {
    const graph = buildExecutionGraph(
      [
        event("checkout", "000", { status: "error" }),
        event("payment", "100", { parentEventId: "checkout" }),
        event("timeout", "200", {
          parentEventId: "payment",
          status: "error",
        }),
        event("later", "300", {
          parentEventId: "checkout",
          status: "error",
        }),
      ],
      [
        edge("checkout", "payment"),
        edge("payment", "timeout"),
        edge("checkout", "later"),
      ],
    );

    // The root failed because of its children and started first, but the
    // timeout is where the failure originated.
    expect(graph.firstFailureId).toBe("timeout");
    expect(graph.failurePath).toEqual(["checkout", "payment", "timeout"]);
  });

  it("picks the earliest origin when several branches fail", () => {
    const graph = buildExecutionGraph(
      [
        event("root", "000", { status: "error" }),
        event("second", "200", { parentEventId: "root", status: "error" }),
        event("first", "100", { parentEventId: "root", status: "error" }),
      ],
      [edge("root", "second"), edge("root", "first")],
    );

    expect(graph.firstFailureId).toBe("first");
  });

  it("falls back to the earliest error when every error is on a cycle", () => {
    const graph = buildExecutionGraph(
      [
        event("x", "000", { parentEventId: "y", status: "error" }),
        event("y", "100", { parentEventId: "x", status: "error" }),
      ],
      [edge("y", "x"), edge("x", "y")],
    );

    expect(graph.firstFailureId).toBe("x");
  });

  it("follows parent edges from a nested failure back to the root", () => {
    const graph = buildExecutionGraph(
      [
        event("checkout", "000"),
        event("payment", "100", { parentEventId: "checkout" }),
        event("timeout", "200", {
          parentEventId: "payment",
          status: "error",
        }),
      ],
      [edge("checkout", "payment"), edge("payment", "timeout")],
    );

    expect(graph.firstFailureId).toBe("timeout");
    expect(graph.failurePath).toEqual(["checkout", "payment", "timeout"]);
  });
});
