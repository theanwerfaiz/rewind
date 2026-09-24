import { NextRequest, NextResponse } from "next/server";

import { getExecutions } from "@/lib/executions";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const requestedLimit = Number(
      request.nextUrl.searchParams.get("limit") ?? "100",
    );

    const limit = Math.min(
      Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 100, 1),
      500,
    );

    const executions = getExecutions(limit);

    return NextResponse.json({
      executions,
      count: executions.length,
    });
  } catch (error) {
    console.error("Failed to fetch executions:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch executions",
      },
      {
        status: 500,
      },
    );
  }
}
