import { NextRequest, NextResponse } from "next/server";
import { MAX_CAPSULE_BODY_BYTES, readJsonBody } from "@/lib/request-body";

import { validateCapsule } from "@/lib/capsule";
import {
  getVerificationRuns,
  runVerification,
  selectFailureExecutions,
  type VerificationTarget,
} from "@/lib/verification";

export const runtime = "nodejs";

const MAX_TARGETS = 200;

export async function GET() {
  try {
    const runs = getVerificationRuns();

    return NextResponse.json({
      runs,
      count: runs.length,
    });
  } catch (error) {
    console.error("Failed to list verification runs:", error);

    return NextResponse.json(
      {
        error: "Failed to list verification runs",
      },
      {
        status: 500,
      },
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Replays stored executions against a candidate build and reports which
 * historical failures are fixed, still failing, or newly failing.
 *
 * Body: { capsules?: Capsule[], executionIds?: string[],
 *         select?: "failures", codeVersion?: string, baseUrl?: string }
 */
export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await readJsonBody(request, MAX_CAPSULE_BODY_BYTES);
  } catch {
    return NextResponse.json(
      {
        errors: ["Request body must contain valid JSON."],
      },
      {
        status: 400,
      },
    );
  }

  if (!isRecord(body)) {
    return NextResponse.json(
      {
        errors: ["Request body must be a JSON object."],
      },
      {
        status: 400,
      },
    );
  }

  const targets: VerificationTarget[] = [];

  const errors: string[] = [];

  if (body.capsules !== undefined) {
    if (!Array.isArray(body.capsules)) {
      errors.push("capsules must be an array.");
    } else {
      body.capsules.forEach((input, index) => {
        const validation = validateCapsule(input);

        if ("errors" in validation) {
          errors.push(
            ...validation.errors.map((error) => `capsules[${index}]: ${error}`),
          );
        } else {
          targets.push({
            capsule: validation.capsule,
          });
        }
      });
    }
  }

  if (body.executionIds !== undefined) {
    if (
      !Array.isArray(body.executionIds) ||
      !body.executionIds.every((id) => typeof id === "string")
    ) {
      errors.push("executionIds must be an array of strings.");
    } else {
      targets.push(
        ...body.executionIds.map((executionId: string) => ({
          executionId,
        })),
      );
    }
  }

  if (body.select !== undefined) {
    if (body.select !== "failures") {
      errors.push('select must be "failures".');
    } else {
      targets.push(...selectFailureExecutions());
    }
  }

  if (
    body.codeVersion !== undefined &&
    (typeof body.codeVersion !== "string" || body.codeVersion.length > 200)
  ) {
    errors.push("codeVersion must be a string of at most 200 characters.");
  }

  if (body.baseUrl !== undefined && typeof body.baseUrl !== "string") {
    errors.push("baseUrl must be a string.");
  }

  if (errors.length === 0 && targets.length === 0) {
    errors.push(
      'Nothing to verify: pass capsules, executionIds, or select: "failures".',
    );
  }

  if (targets.length > MAX_TARGETS) {
    errors.push(`At most ${MAX_TARGETS} executions can be verified per run.`);
  }

  if (errors.length > 0) {
    return NextResponse.json(
      {
        errors,
      },
      {
        status: 400,
      },
    );
  }

  try {
    const run = await runVerification({
      targets,
      codeVersion:
        typeof body.codeVersion === "string" ? body.codeVersion : null,
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
    });

    return NextResponse.json(
      {
        run,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error("Verification failed:", error);

    return NextResponse.json(
      {
        errors: ["Verification failed"],
      },
      {
        status: 500,
      },
    );
  }
}
