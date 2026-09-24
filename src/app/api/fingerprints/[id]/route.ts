import { NextRequest, NextResponse } from "next/server";

import { getExecutionsByFingerprint } from "@/lib/executions";
import { getFingerprintById } from "@/lib/fingerprints";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const { id } = await context.params;

    const fingerprint = getFingerprintById(id);

    if (!fingerprint) {
      return NextResponse.json(
        {
          error: "Fingerprint not found",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      fingerprint,
      executions: getExecutionsByFingerprint(id),
    });
  } catch (error) {
    console.error("Failed to fetch fingerprint:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch fingerprint",
      },
      {
        status: 500,
      },
    );
  }
}
