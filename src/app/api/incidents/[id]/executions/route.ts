import { NextRequest, NextResponse } from "next/server";

import { setIncidentExecution } from "@/lib/incidents";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

async function handle(request: NextRequest, context: Context, remove: boolean) {
  const { id } = await context.params;

  const body = (await request.json().catch(() => null)) as { executionId?: unknown } | null;

  const result = setIncidentExecution(id, body?.executionId, remove);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }

  return NextResponse.json(result);
}

/** Links an execution to the incident. */
export async function POST(request: NextRequest, context: Context) {
  return handle(request, context, false);
}

/** Unlinks an execution from the incident. */
export async function DELETE(request: NextRequest, context: Context) {
  return handle(request, context, true);
}
