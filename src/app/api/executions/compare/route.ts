import { NextRequest, NextResponse } from "next/server";

import { compareExecutions } from "@/lib/execution-compare";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const originalId = request.nextUrl.searchParams.get("original");

    const candidateId = request.nextUrl.searchParams.get("candidate");

    if (!originalId || !candidateId) {
      return NextResponse.json(
        {
          error: "original and candidate execution IDs are required.",
        },
        {
          status: 400,
        },
      );
    }

    const diff = compareExecutions(originalId, candidateId);

    if (!diff) {
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
      diff,
    });
  } catch (error) {
    console.error("Failed to compare executions:", error);

    return NextResponse.json(
      {
        error: "Failed to compare executions",
      },
      {
        status: 500,
      },
    );
  }
}
