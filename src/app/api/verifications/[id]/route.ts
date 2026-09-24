import { NextRequest, NextResponse } from "next/server";

import { getVerificationRun } from "@/lib/verification";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;

  const run = getVerificationRun(id);

  if (!run) {
    return NextResponse.json(
      {
        error: "Verification run not found",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json({
    run,
  });
}
