import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NextRequest } from "next/server";

import { POST as createEvent } from "@/app/api/events/route";
import { GET, PUT } from "@/app/api/settings/route";
import db from "@/lib/db";
import { REDACTED } from "@/lib/redaction";
import {
  applyIngestRedaction,
  DEFAULT_SETTINGS,
  getSettings,
  updateSettings,
} from "@/lib/settings";

// Other test files share this database and run in parallel. Each test
// runs in a transaction that is rolled back, so a setting such as
// defaultDependencyMode "blocked" is never visible to them.
beforeEach(() => {
  db.exec("BEGIN");
});

afterEach(() => {
  db.exec("ROLLBACK");
});

describe("settings", () => {
  it("defaults to no extra redaction and recorded dependencies", () => {
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("stores normalised redaction rules and drops built-in headers", () => {
    const result = updateSettings({
      extraRedactedHeaders: [" X-Tenant-Secret ", "authorization", "x-tenant-secret"],
      extraRedactedFields: ["ssn", "dateOfBirth"],
    });

    expect(result).toEqual({
      settings: {
        extraRedactedHeaders: ["x-tenant-secret"],
        extraRedactedFields: ["ssn", "dateOfBirth"],
        defaultDependencyMode: "recorded",
      },
    });
  });

  it("refuses live as the default dependency mode", () => {
    expect(updateSettings({ defaultDependencyMode: "live" })).toHaveProperty("error");
    expect(getSettings().defaultDependencyMode).toBe("recorded");

    updateSettings({ defaultDependencyMode: "blocked" });

    expect(getSettings().defaultDependencyMode).toBe("blocked");
  });

  it("rejects invalid names instead of storing them", () => {
    expect(updateSettings({ extraRedactedHeaders: ["bad header"] })).toHaveProperty(
      "error",
    );
    expect(updateSettings({ extraRedactedFields: "ssn" })).toHaveProperty("error");
    expect(
      updateSettings({ extraRedactedFields: Array.from({ length: 51 }, (_, i) => `f${i}`) }),
    ).toHaveProperty("error");
  });

  it("redacts extra headers and fields without touching anything else", () => {
    const event = {
      metadata: {
        method: "POST",
        headers: { "x-tenant-secret": "abc", accept: "*/*" },
        response: {
          status: 200,
          headers: { "X-Tenant-Secret": "def" },
          body: { user: { SSN: "123", name: "Ada" } },
        },
      },
      payload: { items: [{ ssn: "456", sku: "A" }] },
    };

    const redacted = applyIngestRedaction(event, {
      ...DEFAULT_SETTINGS,
      extraRedactedHeaders: ["x-tenant-secret"],
      extraRedactedFields: ["ssn"],
    });

    expect(redacted).toEqual({
      metadata: {
        method: "POST",
        headers: { "x-tenant-secret": REDACTED, accept: "*/*" },
        response: {
          status: 200,
          headers: { "X-Tenant-Secret": REDACTED },
          body: { user: { SSN: REDACTED, name: "Ada" } },
        },
      },
      payload: { items: [{ ssn: REDACTED, sku: "A" }] },
    });

    // The input is not modified.
    expect(event.metadata.headers["x-tenant-secret"]).toBe("abc");
  });

  it("applies the rules when events are ingested", async () => {
    updateSettings({ extraRedactedFields: ["ssn"] });

    const response = await createEvent(
      new NextRequest("http://localhost:3000/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "http.request",
          title: "POST /api/patients",
          payload: { ssn: "123-45-6789" },
        }),
      }),
    );

    const data = await response.json();

    const row = db
      .prepare(`SELECT payload FROM events WHERE id = ?`)
      .get(data.event.id) as { payload: string };

    expect(JSON.parse(row.payload)).toEqual({ ssn: REDACTED });
  });

  it("is served by GET and PUT /api/settings", async () => {
    const put = await PUT(
      new NextRequest("http://localhost:3000/api/settings", {
        method: "PUT",
        body: JSON.stringify({ defaultDependencyMode: "blocked" }),
      }),
    );

    expect(put.status).toBe(200);

    const bad = await PUT(
      new NextRequest("http://localhost:3000/api/settings", {
        method: "PUT",
        body: "not json",
      }),
    );

    expect(bad.status).toBe(400);

    const get = await GET();

    expect((await get.json()).settings.defaultDependencyMode).toBe("blocked");
  });
});
