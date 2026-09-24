import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@/lib/request-body";

import { withRewindCapture } from "@/lib/rewind-http";

async function handler(request: NextRequest) {
  try {
    const body = await readJsonBody(request);

    return NextResponse.json({
      success: true,

      receivedPayload: body,
    });
  } catch (error) {
    console.error("Test capture failed:", error);

    return NextResponse.json(
      {
        // Details stay in the server log; they can name paths or internals.
        error: "Test capture failed.",
      },
      {
        status: 500,
      },
    );
  }
}

export const POST = withRewindCapture(handler);
