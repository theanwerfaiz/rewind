import { NextRequest, NextResponse } from "next/server";

import { deleteInvariant } from "@/lib/invariant-store";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;

  if (!deleteInvariant(id)) {
    return NextResponse.json(
      {
        error: "Invariant not found",
      },
      {
        status: 404,
      },
    );
  }

  return new NextResponse(null, {
    status: 204,
  });
}
