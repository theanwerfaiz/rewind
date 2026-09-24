import { describe, expect, it } from "vitest";

import db from "@/lib/db";
import { getOnboardingSteps } from "@/lib/onboarding";

describe("getOnboardingSteps", () => {
  it("checks each step against the database", () => {
    db.exec("BEGIN");

    try {
      // Only this connection sees these rows; they are rolled back below.
      db.exec(`DELETE FROM verification_runs`);

      expect(
        getOnboardingSteps().find((step) => step.id === "verify")?.done,
      ).toBe(false);

      db.prepare(
        `INSERT INTO verification_runs (id, created_at, total, passed, failed)
         VALUES ('vrun_onboarding_test', ?, 0, 0, 0)`,
      ).run(new Date().toISOString());

      const steps = getOnboardingSteps();

      expect(steps.map((step) => step.id)).toEqual([
        "capture",
        "dependency",
        "experiment",
        "invariant",
        "capsule",
        "verify",
      ]);

      expect(steps.find((step) => step.id === "verify")?.done).toBe(true);
    } finally {
      db.exec("ROLLBACK");
    }
  });
});
