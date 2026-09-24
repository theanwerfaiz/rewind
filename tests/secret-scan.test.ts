import { describe, expect, it } from "vitest";

import { hasBlockingFindings, scanForSecrets } from "@/lib/secret-scan";

describe("scanForSecrets", () => {
  it.each([
    ["private key", "-----BEGIN RSA PRIVATE KEY-----\nMIIE..."],
    ["AWS access key", "AKIAIOSFODNN7EXAMPLE"],
    ["Stripe secret key", "sk_live_51HxYzAbCdEfGhIjKl"],
    ["GitHub token", `ghp_${"a".repeat(36)}`],
    ["Slack token", "xoxb-1234567890-abcdefghij"],
    ["Google API key", `AIza${"B".repeat(35)}`],
    ["AI provider API key", `sk-ant-${"c".repeat(40)}`],
    [
      "JSON Web Token",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
    ],
    ["bearer token", "Authorization was Bearer abcdefghijklmnopqrstuvwx"],
    ["payment card number", "card 4242 4242 4242 4242 on file"],
  ])("finds a %s", (rule, value) => {
    const findings = scanForSecrets({
      nested: [
        {
          value,
        },
      ],
    });

    expect(findings).toEqual([
      expect.objectContaining({
        path: "nested[0].value",
        rule,
        severity: "secret",
      }),
    ]);

    expect(hasBlockingFindings(findings)).toBe(true);
  });

  it("masks what it reports", () => {
    const [finding] = scanForSecrets("AKIAIOSFODNN7EXAMPLE");

    expect(finding.preview).not.toContain("IOSFODNN7EXAMP");
    expect(finding.preview.startsWith("AKIA")).toBe(true);
  });

  it("finds card numbers stored as numbers", () => {
    expect(scanForSecrets({ card: 4111111111111111 })[0]?.rule).toBe(
      "payment card number",
    );
  });

  it("scans object keys too", () => {
    expect(
      scanForSecrets({
        sk_live_51HxYzAbCdEfGhIjKl: true,
      })[0]?.rule,
    ).toBe("Stripe secret key");
  });

  it("reports emails as personal data without blocking", () => {
    const findings = scanForSecrets({
      user: "ada@example.com",
    });

    expect(findings).toEqual([
      expect.objectContaining({
        rule: "email address",
        severity: "pii",
      }),
    ]);

    expect(hasBlockingFindings(findings)).toBe(false);
  });

  it.each([
    ["an ID with a millisecond timestamp", "req_1790216337006"],
    ["a plain timestamp number", 1790216337006],
    ["an ISO timestamp", "2026-09-24T02:18:56.000Z"],
    ["a UUID", "7f1c2d3e-8a9b-4c5d-9e0f-1a2b3c4d5e6f"],
    ["a number failing the Luhn check", "4242 4242 4242 4241"],
    ["a test-mode Stripe key", "sk_test_51HxYzAbCdEfGhIjKl"],
    ["a redacted value", "[REDACTED]"],
    ["a short bearer word", "Bearer token"],
  ])("does not flag %s", (_label, value) => {
    expect(scanForSecrets({ value })).toEqual([]);
  });
});
