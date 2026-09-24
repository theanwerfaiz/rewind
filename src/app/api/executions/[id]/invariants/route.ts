import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@/lib/request-body";

import { getExecutionById } from "@/lib/executions";
import { addInvariant, getInvariantsForExecution } from "@/lib/invariant-store";
import {
  describeInvariant,
  evaluateInvariants,
  parseInvariant,
} from "@/lib/invariants";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

/** The execution's invariants, evaluated against the execution itself. */
export async function GET(_request: NextRequest, context: Context) {
  const { id } = await context.params;

  const stored = getExecutionById(id);

  if (!stored) {
    return NextResponse.json(
      {
        error: "Execution not found",
      },
      {
        status: 404,
      },
    );
  }

  const invariants = getInvariantsForExecution(id);

  const results = evaluateInvariants(invariants, {
    status: stored.execution.status,
    startedAt: stored.execution.startedAt,
    endedAt: stored.execution.endedAt,
    rootEventId: stored.execution.rootEventId,
    events: stored.events,
  });

  return NextResponse.json({
    invariants: invariants.map((invariant, index) => ({
      invariant,
      description: describeInvariant(invariant),
      result: results[index],
    })),
  });
}

export async function POST(request: NextRequest, context: Context) {
  const { id } = await context.params;

  if (!getExecutionById(id)) {
    return NextResponse.json(
      {
        error: "Execution not found",
      },
      {
        status: 404,
      },
    );
  }

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

  const parsed = parseInvariant(body);

  if ("error" in parsed) {
    return NextResponse.json(
      {
        error: parsed.error,
      },
      {
        status: 400,
      },
    );
  }

  const invariant = addInvariant(id, parsed.invariant);

  return NextResponse.json(
    {
      invariant,
      description: describeInvariant(invariant),
    },
    {
      status: 201,
    },
  );
}
