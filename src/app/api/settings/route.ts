import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@/lib/request-body";

import { getSettings, updateSettings } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    settings: getSettings(),
  });
}

export async function PUT(request: NextRequest) {
  let body: unknown;

  try {
    body = await readJsonBody(request);
  } catch {
    return NextResponse.json(
      {
        error: "Request body must be JSON.",
      },
      {
        status: 400,
      },
    );
  }

  const result = updateSettings(body);

  if ("error" in result) {
    return NextResponse.json(result, {
      status: 400,
    });
  }

  return NextResponse.json(result);
}
