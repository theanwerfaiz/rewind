import { NextRequest, NextResponse } from "next/server";
import { BodyTooLargeError, readTextBody } from "@/lib/request-body";

import { validateCapsule } from "@/lib/capsule";
import { getCapsuleImports, importCapsule } from "@/lib/capsule-store";
import { scanForSecrets } from "@/lib/secret-scan";

export const runtime = "nodejs";

const MAX_CAPSULE_BYTES = 10 * 1024 * 1024;

export async function GET() {
  try {
    const imports = getCapsuleImports();

    return NextResponse.json({
      imports,
      count: imports.length,
    });
  } catch (error) {
    console.error("Failed to list capsules:", error);

    return NextResponse.json(
      {
        error: "Failed to list capsules",
      },
      {
        status: 500,
      },
    );
  }
}

/**
 * Imports a Reproduction Capsule. The capsule is validated (structure,
 * references and integrity digest) before anything is written.
 */
export async function POST(request: NextRequest) {
  try {
    let text = "";

    let tooLarge = false;

    try {
      text = await readTextBody(request, MAX_CAPSULE_BYTES);
    } catch (error) {
      if (!(error instanceof BodyTooLargeError)) {
        throw error;
      }

      tooLarge = true;
    }

    if (tooLarge) {
      return NextResponse.json(
        {
          errors: ["Capsules larger than 10 MiB cannot be imported."],
        },
        {
          status: 413,
        },
      );
    }

    let input: unknown;

    try {
      input = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          errors: ["The capsule is not valid JSON."],
        },
        {
          status: 400,
        },
      );
    }

    const validation = validateCapsule(input);

    if ("errors" in validation) {
      return NextResponse.json(
        {
          errors: validation.errors,
        },
        {
          status: 400,
        },
      );
    }

    const result = importCapsule(validation.capsule);

    if (!result.imported) {
      return NextResponse.json(
        {
          errors: [result.reason],
        },
        {
          status: 409,
        },
      );
    }

    return NextResponse.json(
      {
        capsuleId: validation.capsule.id,
        executionId: result.executionId,
        warnings: scanForSecrets(validation.capsule),
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error("Failed to import capsule:", error);

    return NextResponse.json(
      {
        errors: ["Failed to import capsule"],
      },
      {
        status: 500,
      },
    );
  }
}
