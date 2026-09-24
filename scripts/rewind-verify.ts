/**
 * Verify stored executions against a candidate build, for CI.
 *
 *   npm run verify -- [capsule.rewind.json ...] [options]
 *
 * With capsule files, those capsules are imported (if needed) and replayed.
 * Without, every recorded failure fingerprint is replayed.
 *
 * Options:
 *   --rewind <url>        Rewind server (default: $REWIND_URL or http://localhost:3000)
 *   --target <url>        Candidate app to replay against (localhost only;
 *                         default: the Rewind server's REWIND_REPLAY_BASE_URL)
 *   --code-version <v>    Label for the run, e.g. a commit SHA ($GITHUB_SHA)
 *   --json                Print the run as JSON
 *
 * Exit codes: 0 all passed, 1 at least one failed, 2 could not run.
 */

import { readFile } from "node:fs/promises";

type Result = {
  title: string;
  executionId: string;
  expectedStatus: string | null;
  outcome: string | null;
  verdict: "pass" | "fail";
  reason: string;
};

type Run = {
  id: string;
  codeVersion: string | null;
  target: string | null;
  total: number;
  passed: number;
  failed: number;
  results: Result[];
};

function parseArgs(argv: string[]) {
  const options = {
    rewind: process.env.REWIND_URL ?? "http://localhost:3000",
    target: undefined as string | undefined,
    codeVersion: process.env.GITHUB_SHA?.slice(0, 12) as string | undefined,
    json: false,
    files: [] as string[],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    const value = () => {
      const next = argv[index + 1];

      if (!next) {
        throw new Error(`${arg} needs a value.`);
      }

      index += 1;

      return next;
    };

    if (arg === "--rewind") {
      options.rewind = value();
    } else if (arg === "--target") {
      options.target = value();
    } else if (arg === "--code-version") {
      options.codeVersion = value();
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: npm run verify -- [capsule.rewind.json ...] [--rewind url] [--target url] [--code-version v] [--json]",
      );
      process.exit(0);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option ${arg}.`);
    } else {
      options.files.push(arg);
    }
  }

  return options;
}

const LABELS: Record<string, string> = {
  fixed: "fixed",
  still_failing: "still failing",
  different_failure: "fails differently",
  regressed: "regressed",
  behavior_changed: "behaviour changed",
  unchanged: "unchanged",
};

function printReport(run: Run) {
  console.log("");
  console.log("Rewind Regression Verification");
  console.log(
    `${run.total} ${run.total === 1 ? "execution" : "executions"} replayed against ${run.target ?? "the default target"}${
      run.codeVersion ? ` (code version ${run.codeVersion})` : ""
    }`,
  );
  console.log("");

  for (const result of run.results) {
    const verdict = result.verdict === "pass" ? "PASS" : "FAIL";

    const outcome = result.outcome
      ? (LABELS[result.outcome] ?? result.outcome)
      : "not run";

    console.log(`  ${verdict}  ${outcome.padEnd(18)} ${result.title}`);

    if (result.verdict === "fail") {
      console.log(`        ${result.reason}`);
    }
  }

  const fixed = run.results.filter((result) => result.outcome === "fixed");

  const stillFailing = run.results.filter(
    (result) =>
      result.outcome === "still_failing" ||
      result.outcome === "different_failure",
  );

  const regressed = run.results.filter(
    (result) => result.outcome === "regressed",
  );

  const changed = run.results.filter(
    (result) => result.outcome === "behavior_changed",
  );

  console.log("");
  console.log(`Fixed:            ${fixed.length}`);
  console.log(`Still failing:    ${stillFailing.length}`);
  console.log(`Behaviour changed: ${changed.length}`);
  console.log(`New failures:     ${regressed.length}`);
  console.log("");
  console.log(
    run.failed === 0
      ? `PASS — ${run.passed}/${run.total} verified`
      : `FAIL — ${run.failed} of ${run.total} did not verify`,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const capsules = await Promise.all(
    options.files.map(async (file) => JSON.parse(await readFile(file, "utf8"))),
  );

  const response = await fetch(`${options.rewind}/api/verifications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...(capsules.length > 0 ? { capsules } : { select: "failures" }),
      ...(options.codeVersion ? { codeVersion: options.codeVersion } : {}),
      ...(options.target ? { baseUrl: options.target } : {}),
    }),
  });

  const data = (await response.json()) as {
    run?: Run;
    errors?: string[];
  };

  if (!response.ok || !data.run) {
    console.error("Verification could not run:");

    for (const error of data.errors ?? [`HTTP ${response.status}`]) {
      console.error(`  - ${error}`);
    }

    process.exit(2);
  }

  if (options.json) {
    console.log(JSON.stringify(data.run, null, 2));
  } else {
    printReport(data.run);
  }

  process.exit(data.run.failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(
    `Verification could not run: ${error instanceof Error ? error.message : error}`,
  );
  process.exit(2);
});
