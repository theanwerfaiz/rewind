import { NextRequest, NextResponse } from "next/server";

import { getIncidentById, updateIncident } from "@/lib/incidents";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: Context) {
  const { id } = await context.params;

  const result = getIncidentById(id);

  if (!result) {
    return NextResponse.json({ error: "Incident not found." }, { status: 404 });
  }

  return NextResponse.json(result);
}

export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const result = updateIncident(id, body);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }

  return NextResponse.json(result);
}
