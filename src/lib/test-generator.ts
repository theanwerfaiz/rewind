import { describeInvariant, type Invariant } from "./invariants";
import type { RewindEvent } from "./mock-events";

type HttpTestInput = {
  event: RewindEvent;
  framework?: "playwright" | "vitest";
  /** Invariants of the source execution, asserted where HTTP allows. */
  invariants?: Invariant[];
  fingerprintId?: string | null;
};

type HttpInvariant = Extract<
  Invariant,
  { kind: "http_status" } | { kind: "response_field" }
>;

function isHttpInvariant(invariant: Invariant): invariant is HttpInvariant {
  return (
    invariant.kind === "http_status" || invariant.kind === "response_field"
  );
}

/**
 * A Given/When/Then header recording where the test came from, so a test
 * failure can be traced back to the real execution it reproduces.
 */
function provenance({ event, invariants = [], fingerprintId }: HttpTestInput) {
  const source = [
    event.id,
    event.executionId ? `execution ${event.executionId}` : null,
    fingerprintId ? `failure ${fingerprintId}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const asserted = invariants.filter(isHttpInvariant);

  const verifiedByRewind = invariants.filter(
    (invariant) => !isHttpInvariant(invariant),
  );

  const lines = [
    "/**",
    " * Rewind regression test",
    " *",
    ` * Given: the request captured as ${source}`,
    " * When:  it is sent again",
    ` * Then:  ${
      asserted.length > 0
        ? asserted.map(describeInvariant).join("; ")
        : "it succeeds"
    }`,
  ];

  if (verifiedByRewind.length > 0) {
    lines.push(
      ` * Also verified by Rewind replays: ${verifiedByRewind
        .map(describeInvariant)
        .join("; ")}`,
    );
  }

  lines.push(" */", "");

  return `${lines.join("\n")}\n`;
}

function bodyAccess(path: string) {
  return `body${path
    .split(".")
    .map((key) => `?.[${JSON.stringify(key)}]`)
    .join("")}`;
}

function assertions(
  input: HttpTestInput,
  status: string,
  okCheck: string,
  indent: string,
) {
  const invariants = (input.invariants ?? []).filter(isHttpInvariant);

  const statusChecks = invariants.filter(
    (invariant) => invariant.kind === "http_status",
  );

  const fieldChecks = invariants.filter(
    (invariant) => invariant.kind === "response_field",
  );

  const lines =
    statusChecks.length > 0
      ? statusChecks.map(
          (invariant) =>
            `expect(${status}).toBe(${
              (invariant as Extract<Invariant, { kind: "http_status" }>).equals
            });`,
        )
      : [okCheck];

  if (fieldChecks.length > 0) {
    lines.push("", "const body = await response.json();", "");

    for (const invariant of fieldChecks) {
      const field = invariant as Extract<Invariant, { kind: "response_field" }>;

      lines.push(
        `expect(${bodyAccess(field.path)}).toEqual(${JSON.stringify(field.equals)});`,
      );
    }
  }

  return lines.map((line) => (line ? `${indent}${line}` : "")).join("\n");
}

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

export function generatePlaywrightTest(input: HttpTestInput) {
  const { event } = input;
  const method = getMethod(event);
  const path = getPath(event);
  const payload = formatPayload(event.payload);

  const testName = escapeTestName(`reproduces ${event.title}`);

  const requestMethod = method.toLowerCase();

  const body =
    method === "GET" || method === "HEAD" || payload === null
      ? ""
      : `,\n    data: ${payload}`;

  return `${provenance(input)}import { test, expect } from "@playwright/test";

test("${testName}", async ({ request }) => {
  const response = await request.${requestMethod}(
    ${formatStringLiteral(path)}${body}
  );

${assertions(input, "response.status()", "expect(response.ok()).toBeTruthy();", "  ")}
});
`;
}

export function generateVitestTest(input: HttpTestInput) {
  const { event } = input;
  const method = getMethod(event);
  const path = getPath(event);
  const payload = formatPayload(event.payload);

  const body =
    method === "GET" || method === "HEAD" || payload === null
      ? ""
      : `,\n        body: JSON.stringify(${payload})`;

  return `${provenance(input)}import { describe, expect, it } from "vitest";

describe("Rewind regression", () => {
  it("${escapeTestName(`reproduces ${event.title}`)}", async () => {
    const response = await fetch(
      ${formatStringLiteral(`http://localhost:3000${path}`)},
      {
        method: ${formatStringLiteral(method)}${body}
      }
    );

${assertions(input, "response.status", "expect(response.ok).toBe(true);", "    ")}
  });
});
`;
}

export function generateTest(input: HttpTestInput) {
  if (input.framework === "vitest") {
    return generateVitestTest(input);
  }

  return generatePlaywrightTest(input);
}
