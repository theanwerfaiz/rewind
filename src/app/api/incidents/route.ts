import { NextRequest, NextResponse } from "next/server";

import { createIncident, getIncidents } from "@/lib/incidents";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    incidents: getIncidents(),
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const result = createIncident({
    title: body.title,
    executionId: body.executionId,
  });

  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result, { status: 201 });
}
