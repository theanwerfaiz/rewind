import { NextRequest, NextResponse } from "next/server";

import { search } from "@/lib/search";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q") ?? "";

    return NextResponse.json({
      results: search(query),
    });
  } catch (error) {
    console.error("Search failed:", error);

    return NextResponse.json(
      {
        error: "Search failed",
      },
      {
        status: 500,
      },
    );
  }
}
