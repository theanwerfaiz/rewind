import { NextRequest, NextResponse } from "next/server";

import { getFingerprints } from "@/lib/fingerprints";

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

    const fingerprints = getFingerprints(limit);

    return NextResponse.json({
      fingerprints,
      count: fingerprints.length,
    });
  } catch (error) {
    console.error("Failed to fetch fingerprints:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch fingerprints",
      },
      {
        status: 500,
      },
    );
  }
}
