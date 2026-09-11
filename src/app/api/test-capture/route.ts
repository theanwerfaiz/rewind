import { NextRequest, NextResponse } from "next/server";

import { withRewindCapture } from "@/lib/rewind-http";

async function handler(request: NextRequest) {
  try {
    const body = await request.json();

    return NextResponse.json({
      success: true,

      receivedPayload: body,
    });
  } catch (error) {
    console.error("Test capture failed:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Test capture failed",
      },
      {
        status: 500,
      },
    );
  }
}

export const POST = withRewindCapture(handler);
