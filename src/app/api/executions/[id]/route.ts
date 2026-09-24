import { NextRequest, NextResponse } from "next/server";

import { getExecutionById } from "@/lib/executions";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const { id } = await context.params;

    const result = getExecutionById(id);

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

    return NextResponse.json(result);
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
