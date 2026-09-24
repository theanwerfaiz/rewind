import { afterEach, describe, expect, it } from "vitest";

import { NextRequest } from "next/server";

import { GET } from "@/app/api/health/route";
import { REWIND_VERSION } from "@/lib/version";
import { proxy } from "@/proxy";

import packageJson from "../package.json";

afterEach(() => {
  delete process.env.REWIND_ACCESS_TOKEN;
});

describe("GET /api/health", () => {
  it("reports status, database and the package version", async () => {
    const response = await GET();

    expect(response.status).toBe(200);

    expect(await response.json()).toEqual({
      status: "ok",
      version: packageJson.version,
      database: "ok",
    });

    expect(REWIND_VERSION).toBe(packageJson.version);
  });

  it("stays reachable when access control is on", () => {
    process.env.REWIND_ACCESS_TOKEN = "health-test-token";

    expect(
      proxy(new NextRequest("http://localhost:3000/api/health")).headers.get(
        "x-middleware-next",
      ),
    ).toBe("1");
  });
});
