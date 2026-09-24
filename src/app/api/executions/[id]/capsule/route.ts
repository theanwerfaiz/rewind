import { NextRequest, NextResponse } from "next/server";

import { exportCapsule } from "@/lib/capsule-store";
import { hasBlockingFindings } from "@/lib/secret-scan";

export const runtime = "nodejs";

/**
 * Exports an execution as a Reproduction Capsule (.rewind.json).
 *
 * Export is refused when the secret scan finds high-confidence secrets,
 * unless ?force=1 explicitly overrides it.
 */
export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const { id } = await context.params;

    const result = exportCapsule(id);

    if (!result) {
      return NextResponse.json(
        {
          error: "Execution not found",
        },
        {
          status: 404,
        },
      );
    }

    const force = request.nextUrl.searchParams.get("force") === "1";

    if (hasBlockingFindings(result.findings) && !force) {
      return NextResponse.json(
        {
          error:
            "Export blocked: the capsule contains values that look like secrets. Remove them, or pass force=1 to export anyway.",
          findings: result.findings,
        },
        {
          status: 422,
        },
      );
    }

    const filename = `${result.capsule.execution.fingerprintId ?? result.capsule.execution.id}.rewind.json`;

    return new NextResponse(JSON.stringify(result.capsule, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Failed to export capsule:", error);

    return NextResponse.json(
      {
        error: "Failed to export capsule",
      },
      {
        status: 500,
      },
    );
  }
}
