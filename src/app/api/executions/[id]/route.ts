import { NextRequest, NextResponse } from "next/server";

import { getExecutionGraphById } from "@/lib/executions";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const { id } = await context.params;

    const result = getExecutionGraphById(id);

    if (!result) {
      return NextResponse.json(
        {
          error: "Execution not found",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      execution: result.execution,
      events: result.events,
      edges: result.edges,
      graph: {
        rootIds: result.graph.rootIds,
        firstFailureId: result.graph.firstFailureId,
        failurePath: result.graph.failurePath,
        nodes: result.graph.nodes.map((node) => ({
          eventId: node.event.id,
          depth: node.depth,
          childIds: node.childIds,
          orphan: node.orphan,
        })),
      },
    });
  } catch (error) {
    console.error("Failed to fetch execution:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch execution",
      },
      {
        status: 500,
      },
    );
  }
}
