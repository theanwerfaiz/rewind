import db from "@/lib/db";
import { isReplayExecutionSql } from "@/lib/executions";

export type OnboardingStep = {
  id: string;
  title: string;
  detail: string;
  href: string;
  done: boolean;
};

function exists(sql: string) {
  const row = db.prepare(`SELECT EXISTS (${sql}) AS found`).get() as {
    found: number;
  };

  return row.found === 1;
}

/**
 * The path from first capture to a failure that can never come back, each
 * step checked against what is actually in the database.
 */
export function getOnboardingSteps(): OnboardingStep[] {
  return [
    {
      id: "capture",
      title: "Capture a request",
      detail: "Wrap a route handler with withRewindCapture and send it a request.",
      href: "/executions",
      done: exists(
        `SELECT 1 FROM executions WHERE NOT ${isReplayExecutionSql("executions")}`,
      ),
    },
    {
      id: "dependency",
      title: "Record a dependency",
      detail: "Call outside services through rewindFetch so replays can answer from the recording.",
      href: "/events",
      done: exists(`SELECT 1 FROM events WHERE type = 'http.dependency'`),
    },
    {
      id: "experiment",
      title: "Run an experiment",
      detail: "Replay a captured request in the Replay Lab, changing one thing.",
      href: "/lab",
      done: exists(`SELECT 1 FROM replays`),
    },
    {
      id: "invariant",
      title: "Add an invariant",
      detail: "State what must always hold for an execution, such as HTTP 200.",
      href: "/executions?q=is%3Afailed",
      done: exists(`SELECT 1 FROM invariants`),
    },
    {
      id: "capsule",
      title: "Import a capsule",
      detail: "Move a failure between machines as a single verified file.",
      href: "/capsules",
      done: exists(`SELECT 1 FROM capsule_imports`),
    },
    {
      id: "verify",
      title: "Verify a build",
      detail: "Run npm run verify to replay recorded failures against new code.",
      href: "/verifications",
      done: exists(`SELECT 1 FROM verification_runs`),
    },
  ];
}
