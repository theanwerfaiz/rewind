import { describe, expect, it } from "vitest";

import {
  formatAnnotations,
  formatMarkdownReport,
  type ReportRun,
} from "@/lib/verification-report";

const run: ReportRun = {
  id: "vrun_1",
  codeVersion: "abc123",
  target: "http://localhost:4000",
  total: 2,
  passed: 1,
  failed: 1,
  results: [
    {
      title: "POST /api/orders/1/checkout",
      executionId: "exe_ok",
      outcome: "fixed",
      verdict: "pass",
      reason: "The original failure no longer reproduces.",
      resultExecutionId: "exe_ok_replay",
    },
    {
      title: "POST /api/pay | <script>",
      executionId: "exe_bad",
      outcome: "still_failing",
      verdict: "fail",
      reason: "Still fails:\nsame fingerprint",
      resultExecutionId: null,
    },
  ],
};

describe("formatMarkdownReport", () => {
  it("leads with the verdict and lists failures first", () => {
    const markdown = formatMarkdownReport(run, "http://localhost:3000/");

    const lines = markdown.split("\n");

    expect(lines[0]).toBe("### ❌ Rewind: 1 of 2 did not verify");
    expect(markdown).toContain("at `abc123`");

    const rows = lines.filter((line) => line.startsWith("| ✅") || line.startsWith("| ❌"));

    expect(rows[0]).toContain("still failing");
    expect(rows[1]).toContain(
      "[diff](http://localhost:3000/executions/compare?original=exe_ok&candidate=exe_ok_replay)",
    );

    expect(markdown).toContain("[All verification runs](http://localhost:3000/verifications)");
  });

  it("escapes titles so they cannot break the table or inject HTML", () => {
    const markdown = formatMarkdownReport(run);

    expect(markdown).toContain("POST /api/pay \\| \\<script\\>");
    expect(markdown).toContain("Still fails: same fingerprint");
    expect(markdown).not.toContain("<script>");
  });

  it("reports a clean run as passed", () => {
    const markdown = formatMarkdownReport({
      ...run,
      total: 1,
      passed: 1,
      failed: 0,
      results: [run.results[0]],
    });

    expect(markdown.startsWith("### ✅ Rewind: 1/1 recorded failure verified")).toBe(true);
  });
});

describe("formatAnnotations", () => {
  it("emits one escaped ::error per failed result", () => {
    expect(formatAnnotations(run)).toEqual([
      "::error title=Rewind%3A POST /api/pay | <script>::Still fails:%0Asame fingerprint",
    ]);
  });
});
