import db from "@/lib/db";
import type { Capsule } from "@/lib/capsule";
import { importCapsule } from "@/lib/capsule-store";
import { compareExecutions } from "@/lib/execution-compare";
import type { DiffOutcome } from "@/lib/execution-diff";
import { getExecutionById } from "@/lib/executions";
import { getFingerprints } from "@/lib/fingerprints";
import { runReplay } from "@/lib/replay-runner";

/**
 * Verification replays stored executions (typically real failures) against
 * a candidate build and judges each against what it originally did:
 *
 * - a failure passes when it no longer reproduces ("fixed")
 * - a success passes when it still succeeds (behaviour changes are noted)
 *
 * Dependencies always answer from the recording, so verification never
 * repeats real side effects.
 */

export type VerificationVerdict = "pass" | "fail";

export type VerificationResult = {
  executionId: string;
  capsuleId: string | null;
  title: string;
  expectedStatus: "success" | "error" | null;
  outcome: DiffOutcome | null;
  verdict: VerificationVerdict;
  reason: string;
  replayId: string | null;
  resultExecutionId: string | null;
};

export type VerificationRun = {
  id: string;
  createdAt: string;
  codeVersion: string | null;
  target: string | null;
  total: number;
  passed: number;
  failed: number;
  results: VerificationResult[];
};

export type VerificationTarget =
  | {
      executionId: string;
    }
  | {
      capsule: Capsule;
    };

/**
 * Judges a diff outcome against what the original execution did.
 */
export function judgeOutcome(
  expectedStatus: "success" | "error",
  outcome: DiffOutcome,
): { verdict: VerificationVerdict; reason: string } {
  if (expectedStatus === "error") {
    switch (outcome) {
      case "fixed":
        return {
          verdict: "pass",
          reason: "The original failure no longer reproduces.",
        };

      case "still_failing":
        return {
          verdict: "fail",
          reason: "The original failure still reproduces.",
        };

      default:
        return {
          verdict: "fail",
          reason: "The execution still fails, but in a different way.",
        };
    }
  }

  switch (outcome) {
    case "regressed":
      return {
        verdict: "fail",
        reason: "The execution succeeded originally and now fails.",
      };

    case "behavior_changed":
      return {
        verdict: "pass",
        reason: "Still succeeds, but took a different path.",
      };

    default:
      return {
        verdict: "pass",
        reason: "Behaves as it did originally.",
      };
  }
}

/** Representative executions of every recorded failure fingerprint. */
export function selectFailureExecutions() {
  return getFingerprints(500).map((fingerprint) => ({
    executionId: fingerprint.representativeExecutionId,
  }));
}

async function verifyExecution(
  executionId: string,
  capsuleId: string | null,
  options: { codeVersion: string | null; baseUrl?: string },
): Promise<VerificationResult> {
  const stored = getExecutionById(executionId);

  const base = {
    executionId,
    capsuleId,
    title: executionId,
    expectedStatus: null,
    outcome: null,
    replayId: null,
    resultExecutionId: null,
  };

  if (!stored) {
    return {
      ...base,
      verdict: "fail",
      reason: "Execution not found.",
    };
  }

  const root = stored.events.find(
    (event) => event.id === stored.execution.rootEventId,
  );

  const withTitle = {
    ...base,
    title: root?.title ?? executionId,
    expectedStatus: stored.execution.status,
  };

  if (!root) {
    return {
      ...withTitle,
      verdict: "fail",
      reason: "The execution has no root event to replay.",
    };
  }

  const replay = await runReplay(
    {
      eventId: root.id,
      label: `verify${options.codeVersion ? ` ${options.codeVersion}` : ""}`,
      dependencyMode: "recorded",
    },
    {
      baseUrl: options.baseUrl,
    },
  );

  const replayBody = replay.body.replay as
    | {
        id: string;
        resultExecutionId: string | null;
      }
    | undefined;

  if (replay.status !== 200 || !replayBody) {
    return {
      ...withTitle,
      verdict: "fail",
      reason:
        typeof replay.body.error === "string"
          ? replay.body.error
          : `Replay failed with status ${replay.status}.`,
    };
  }

  const withReplay = {
    ...withTitle,
    replayId: replayBody.id,
    resultExecutionId: replayBody.resultExecutionId,
  };

  if (!replayBody.resultExecutionId) {
    return {
      ...withReplay,
      verdict: "fail",
      reason:
        "The target did not capture the replayed request. Is it wrapped with withRewindCapture?",
    };
  }

  const diff = compareExecutions(executionId, replayBody.resultExecutionId);

  if (!diff) {
    return {
      ...withReplay,
      verdict: "fail",
      reason: "The replayed execution could not be compared.",
    };
  }

  const judged = judgeOutcome(stored.execution.status, diff.outcome);

  // A verdict only passes when the expected behaviour holds too.
  const broken = (diff.invariants ?? []).filter(
    (comparison) => !comparison.candidate.passed,
  );

  if (judged.verdict === "pass" && broken.length > 0) {
    return {
      ...withReplay,
      outcome: diff.outcome,
      verdict: "fail",
      reason: `Invariant failed: ${broken
        .map(
          (comparison) =>
            `${comparison.description} (got ${comparison.candidate.actual})`,
        )
        .join("; ")}`,
    };
  }

  return {
    ...withReplay,
    outcome: diff.outcome,
    ...judged,
  };
}

function persistRun(run: VerificationRun) {
  const insertResult = db.prepare(`
    INSERT INTO verification_results (
      run_id, position, execution_id, capsule_id, title, expected_status,
      outcome, verdict, reason, replay_id, result_execution_id
    )
    VALUES (
      @run_id, @position, @execution_id, @capsule_id, @title,
      @expected_status, @outcome, @verdict, @reason, @replay_id,
      @result_execution_id
    )
  `);

  db.transaction(() => {
    db.prepare(
      `
      INSERT INTO verification_runs (
        id, created_at, code_version, target, total, passed, failed
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      run.id,
      run.createdAt,
      run.codeVersion,
      run.target,
      run.total,
      run.passed,
      run.failed,
    );

    run.results.forEach((result, position) => {
      insertResult.run({
        run_id: run.id,
        position,
        execution_id: result.executionId,
        capsule_id: result.capsuleId,
        title: result.title,
        expected_status: result.expectedStatus,
        outcome: result.outcome,
        verdict: result.verdict,
        reason: result.reason,
        replay_id: result.replayId,
        result_execution_id: result.resultExecutionId,
      });
    });
  }).immediate();
}

/**
 * Verifies each target in turn and stores the run. Capsules are imported
 * first when this Rewind does not have their execution yet.
 */
export async function runVerification({
  targets,
  codeVersion = null,
  baseUrl,
}: {
  targets: VerificationTarget[];
  codeVersion?: string | null;
  baseUrl?: string;
}): Promise<VerificationRun> {
  const results: VerificationResult[] = [];

  for (const target of targets) {
    if ("capsule" in target) {
      const imported = importCapsule(target.capsule);

      const executionId = target.capsule.execution.id;

      if (!imported.imported && !getExecutionById(executionId)) {
        results.push({
          executionId,
          capsuleId: target.capsule.id,
          title: executionId,
          expectedStatus: target.capsule.expected.status,
          outcome: null,
          verdict: "fail",
          reason: imported.reason,
          replayId: null,
          resultExecutionId: null,
        });

        continue;
      }

      results.push(
        await verifyExecution(executionId, target.capsule.id, {
          codeVersion,
          baseUrl,
        }),
      );

      continue;
    }

    results.push(
      await verifyExecution(target.executionId, null, {
        codeVersion,
        baseUrl,
      }),
    );
  }

  const passed = results.filter((result) => result.verdict === "pass").length;

  const run: VerificationRun = {
    id: `vr_${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    codeVersion,
    target:
      baseUrl ?? process.env.REWIND_REPLAY_BASE_URL ?? "http://localhost:3000",
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };

  persistRun(run);

  return run;
}

type RunRow = {
  id: string;
  created_at: string;
  code_version: string | null;
  target: string | null;
  total: number;
  passed: number;
  failed: number;
};

type ResultRow = {
  execution_id: string;
  capsule_id: string | null;
  title: string;
  expected_status: "success" | "error" | null;
  outcome: DiffOutcome | null;
  verdict: VerificationVerdict;
  reason: string;
  replay_id: string | null;
  result_execution_id: string | null;
};

function mapRun(row: RunRow, results: VerificationResult[]): VerificationRun {
  return {
    id: row.id,
    createdAt: row.created_at,
    codeVersion: row.code_version,
    target: row.target,
    total: row.total,
    passed: row.passed,
    failed: row.failed,
    results,
  };
}

function getResults(runId: string): VerificationResult[] {
  return (
    db
      .prepare(
        `SELECT * FROM verification_results WHERE run_id = ? ORDER BY position`,
      )
      .all(runId) as ResultRow[]
  ).map((row) => ({
    executionId: row.execution_id,
    capsuleId: row.capsule_id,
    title: row.title,
    expectedStatus: row.expected_status,
    outcome: row.outcome,
    verdict: row.verdict,
    reason: row.reason,
    replayId: row.replay_id,
    resultExecutionId: row.result_execution_id,
  }));
}

export function getVerificationRuns(limit = 50): VerificationRun[] {
  return (
    db
      .prepare(
        `SELECT * FROM verification_runs ORDER BY created_at DESC LIMIT ?`,
      )
      .all(limit) as RunRow[]
  ).map((row) => mapRun(row, getResults(row.id)));
}

export function getVerificationRun(id: string): VerificationRun | null {
  const row = db
    .prepare(`SELECT * FROM verification_runs WHERE id = ?`)
    .get(id) as RunRow | undefined;

  return row ? mapRun(row, getResults(row.id)) : null;
}
