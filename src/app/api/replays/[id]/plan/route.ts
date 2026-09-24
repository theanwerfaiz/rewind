import { NextRequest, NextResponse } from "next/server";

import db from "@/lib/db";
import type { DependencyMode, ReplayPlan } from "@/lib/dependency-replay";

export const runtime = "nodejs";

type ReplayPlanRow = {
  replay_id: string;
  mode: DependencyMode;
  fixtures: string;
  dependency_mutations: string;
};

/**
 * How dependency calls behave during a replay. Fetched by the target
 * application's withRewindCapture when it receives a replayed request.
 */
export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const { id } = await context.params;

    const row = db
      .prepare(`SELECT * FROM replay_plans WHERE replay_id = ?`)
      .get(id) as ReplayPlanRow | undefined;

    if (!row) {
      return NextResponse.json(
        {
          error: "Replay plan not found",
        },
        {
          status: 404,
        },
      );
    }

    const plan: ReplayPlan = {
      replayId: row.replay_id,
      mode: row.mode,
      fixtures: JSON.parse(row.fixtures),
      dependencyMutations: JSON.parse(row.dependency_mutations),
    };

    return NextResponse.json({
      plan,
    });
  } catch (error) {
    console.error("Failed to fetch replay plan:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch replay plan",
      },
      {
        status: 500,
      },
    );
  }
}
