import { NextResponse } from "next/server";

import db from "@/lib/db";
import { REWIND_VERSION } from "@/lib/version";

export const runtime = "nodejs";

/**
 * Liveness and version, for deploy checks and container health checks.
 * Answers 503 when the database cannot be read.
 */
export async function GET() {
  let database: "ok" | "unavailable" = "ok";

  try {
    db.prepare("SELECT 1").get();
  } catch (error) {
    console.error("Health check: database unavailable:", error);

    database = "unavailable";
  }

  return NextResponse.json(
    {
      status: database === "ok" ? "ok" : "degraded",
      version: REWIND_VERSION,
      database,
    },
    {
      status: database === "ok" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
