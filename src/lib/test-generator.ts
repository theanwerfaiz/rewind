import type { RewindEvent } from "./mock-events";

type HttpTestInput = {
  event: RewindEvent;
  framework?: "playwright" | "vitest";
};

function getMetadataValue(event: RewindEvent, key: string): string | null {
  const value = event.metadata?.[key];

  return typeof value === "string" ? value : null;
}

function getMethod(event: RewindEvent) {
  return (getMetadataValue(event, "method") ?? "POST").toUpperCase();
}

function getPath(event: RewindEvent) {
  return getMetadataValue(event, "path") ?? "/";
}

function formatPayload(payload: unknown) {
  if (payload === null || payload === undefined) {
    return null;
  }

  return JSON.stringify(payload, null, 2);
}

function escapeTestName(title: string) {
  return title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formatStringLiteral(value: string) {
  return JSON.stringify(value);
}

export function generatePlaywrightTest({ event }: HttpTestInput) {
  const method = getMethod(event);
  const path = getPath(event);
  const payload = formatPayload(event.payload);

  const testName = escapeTestName(`reproduces ${event.title}`);

  const requestMethod = method.toLowerCase();

  const body =
    method === "GET" || method === "HEAD" || payload === null
      ? ""
      : `,\n    data: ${payload}`;

  return `import { test, expect } from "@playwright/test";

test("${testName}", async ({ request }) => {
  const response = await request.${requestMethod}(
    ${formatStringLiteral(path)}${body}
  );

  expect(response.ok()).toBeTruthy();
});
`;
}

export function generateVitestTest({ event }: HttpTestInput) {
  const method = getMethod(event);
  const path = getPath(event);
  const payload = formatPayload(event.payload);

  const body =
    method === "GET" || method === "HEAD" || payload === null
      ? ""
      : `,\n        body: JSON.stringify(${payload})`;

  return `import { describe, expect, it } from "vitest";

describe("Rewind regression", () => {
  it("${escapeTestName(`reproduces ${event.title}`)}", async () => {
    const response = await fetch(
      ${formatStringLiteral(`http://localhost:3000${path}`)},
      {
        method: ${formatStringLiteral(method)}${body}
      }
    );

    expect(response.ok).toBe(true);
  });
});
`;
}

export function generateTest({
  event,
  framework = "playwright",
}: HttpTestInput) {
  if (framework === "vitest") {
    return generateVitestTest({
      event,
      framework,
    });
  }

  return generatePlaywrightTest({
    event,
    framework,
  });
}
