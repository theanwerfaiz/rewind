import { NextRequest, NextResponse } from "next/server";

import {
  buildInvestigation,
  concludeInvestigation,
  testHypotheses,
} from "@/lib/investigation";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

function notInvestigable() {
  return NextResponse.json(
    {
      error: "Only failed executions can be investigated.",
    },
    {
      status: 404,
    },
  );
}

/** Read-only: observation, evidence and hypotheses. Nothing is replayed. */
export async function GET(_request: NextRequest, context: Context) {
  const { id } = await context.params;

  const investigation = buildInvestigation(id);

  return investigation
    ? NextResponse.json({
        investigation,
      })
    : notInvestigable();
}

/**
 * Tests every hypothesis by replaying the execution with its experiment.
 * Dependencies answer from recordings, so no real side effects happen.
 */
export async function POST(_request: NextRequest, context: Context) {
  const { id } = await context.params;

  const investigation = buildInvestigation(id);

  if (!investigation) {
    return notInvestigable();
  }

  const results = await testHypotheses(investigation);

  return NextResponse.json({
    investigation,
    results,
    conclusion: concludeInvestigation(results),
  });
}
