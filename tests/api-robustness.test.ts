import { describe, expect, it } from "vitest";

import { NextRequest } from "next/server";

import { POST as createEvent } from "@/app/api/events/route";
import { POST as createIncident } from "@/app/api/incidents/route";
import { POST as replay } from "@/app/api/replay/route";
import { PUT as updateSettings } from "@/app/api/settings/route";
import { POST as generateTest } from "@/app/api/test-generator/route";
import { POST as runTest } from "@/app/api/test-runner/route";
import { POST as captureWebhook } from "@/app/api/webhooks/capture/route";

const routes = {
  "POST /api/events": createEvent,
  "POST /api/incidents": createIncident,
  "POST /api/replay": replay,
  "PUT /api/settings": updateSettings,
  "POST /api/test-generator": generateTest,
  "POST /api/test-runner": runTest,
};

function send(body: string) {
  return new NextRequest("http://localhost:3000/api/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("malformed request bodies get a 4xx, never a 500", () => {
  for (const [name, handler] of Object.entries(routes)) {
    for (const body of ["{bad", "null", "[]", '"text"']) {
      it(`${name} with ${body}`, async () => {
        const response = await handler(send(body));

        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
      });
    }
  }

  it("POST /api/webhooks/capture with invalid JSON", async () => {
    expect((await captureWebhook(send("{bad"))).status).toBe(400);
  });
});
