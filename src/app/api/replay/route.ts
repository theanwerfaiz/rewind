import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@/lib/request-body";

import { runReplay } from "@/lib/replay-runner";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await readJsonBody(request);
  } catch {
    return NextResponse.json(
      {
        error: "Request body must contain valid JSON.",
      },
      {
        status: 400,
      },
    );
  }

  const result = await runReplay(body);

  return NextResponse.json(result.body, {
    status: result.status,
  });
}
