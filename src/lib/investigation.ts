import db from "@/lib/db";
import { dependencyKey } from "@/lib/dependency-replay";
import { compareExecutions } from "@/lib/execution-compare";
import type { DiffOutcome } from "@/lib/execution-diff";
import {
  getExecutionById,
  getExecutionGraphById,
  type RewindExecution,
} from "@/lib/executions";
import { getFingerprintById } from "@/lib/fingerprints";
import { normalizeEndpoint } from "@/lib/fingerprint";
import type { RewindEvent } from "@/lib/mock-events";
import { describeMutation, type Mutation } from "@/lib/mutations";
import { findReplayChanges } from "@/lib/replay-diff";
import { runReplay } from "@/lib/replay-runner";

/**
 * Evidence-based investigation of a failed execution.
 *
 * Rule-based and deterministic: every statement cites the Rewind evidence
 * it comes from (events, executions, replays). Hypotheses come with an
 * experiment that tests them by replaying the execution with dependencies
 * answered from recordings, so testing a hypothesis never repeats real side
 * effects and never touches production.
 */

export type EvidenceRef =
  | { kind: "event"; id: string }
  | { kind: "execution"; id: string }
  | { kind: "fingerprint"; id: string }
  | { kind: "replay"; id: string };

export type Finding = {
  statement: string;
  refs: EvidenceRef[];
};

export type Hypothesis = {
  id: string;
  statement: string;
  refs: EvidenceRef[];
  experiment: {
    label: string;
    mutations: Mutation[];
    description: string;
  };
};

export type HypothesisResult = {
  hypothesisId: string;
  status: "confirmed" | "rejected" | "inconclusive";
  outcome: DiffOutcome | null;
  statement: string;
  refs: EvidenceRef[];
};

export type Investigation = {
  executionId: string;
  observation: Finding;
  evidence: Finding[];
  hypotheses: Hypothesis[];
};

const MAX_INPUT_MUTATIONS = 10;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseOf(event: RewindEvent | undefined) {
  const response = isRecord(event?.metadata)
    ? event.metadata.response
    : undefined;

  return isRecord(response) ? response : undefined;
}

function httpStatusOf(event: RewindEvent | undefined) {
  const status = responseOf(event)?.status;

  return typeof status === "number" ? status : null;
}

function offsetMs(event: RewindEvent, execution: RewindExecution) {
  return Math.max(
    Date.parse(event.timestamp) - Date.parse(execution.startedAt),
    0,
  );
}

/**
 * The most recent successful real execution of the same endpoint, preferring
 * one that started before the failure.
 */
function findLastKnownGood(
  execution: RewindExecution,
  rootTitle: string,
): RewindExecution | null {
  const endpoint = normalizeEndpoint(rootTitle);

  // Narrow in SQL by the endpoint up to its first ID segment, then match
  // the normalised endpoint exactly.
  const prefix = endpoint.split(":id")[0].replace(/[\\%_]/g, "\\$&");

  const candidates = (
    db
      .prepare(
        `
        SELECT executions.id
        FROM executions
        JOIN events AS root ON root.id = executions.root_event_id
        WHERE executions.status = 'success'
          AND executions.id != ?
          AND root.title LIKE ? ESCAPE '\\'
        ORDER BY executions.started_at DESC
        LIMIT 200
        `,
      )
      .all(execution.id, `${prefix}%`) as { id: string }[]
  )
    .map((row) => getExecutionById(row.id)?.execution)
    .filter(
      (candidate): candidate is RewindExecution =>
        candidate !== undefined &&
        !candidate.isReplay &&
        candidate.rootTitle !== null &&
        normalizeEndpoint(candidate.rootTitle) === endpoint,
    );

  return (
    candidates.find((candidate) => candidate.startedAt < execution.startedAt) ??
    candidates[0] ??
    null
  );
}

/**
 * A successful recorded response for the same dependency, from any
 * execution, to stand in for the failing call.
 */
function findHealthyDependencyResponse(title: string) {
  const key = dependencyKey(title);

  const rows = db
    .prepare(
      `
      SELECT id, title, metadata
      FROM events
      WHERE type = 'http.dependency' AND status = 'success'
      ORDER BY timestamp DESC
      LIMIT 500
      `,
    )
    .all() as { id: string; title: string; metadata: string | null }[];

  for (const row of rows) {
    if (dependencyKey(row.title) !== key || !row.metadata) {
      continue;
    }

    try {
      const response = JSON.parse(row.metadata).response;

      if (
        isRecord(response) &&
        typeof response.status === "number" &&
        response.status < 400 &&
        response.truncated !== true
      ) {
        return {
          eventId: row.id,
          status: response.status,
          body: response.body,
        };
      }
    } catch {
      // Skip unreadable metadata.
    }
  }

  return null;
}

/** Converts a replay-diff path ("payload.items[0].qty") to a mutation path. */
function toMutationPath(path: string) {
  if (!path.startsWith("payload.")) {
    return null;
  }

  return path.slice("payload.".length).replace(/\[(\d+)\]/g, ".$1");
}

export function buildInvestigation(executionId: string): Investigation | null {
  const loaded = getExecutionGraphById(executionId);

  if (!loaded || loaded.execution.status !== "error") {
    return null;
  }

  const { execution, events, graph } = loaded;

  const byId = new Map(events.map((event) => [event.id, event]));

  const root = execution.rootEventId ? byId.get(execution.rootEventId) : null;

  const origin = graph.firstFailureId ? byId.get(graph.firstFailureId) : null;

  const rootTitle = root?.title ?? execution.id;

  const rootStatus = httpStatusOf(root ?? undefined);

  const observation: Finding = {
    statement: `${rootTitle} ${
      rootStatus ? `returned ${rootStatus}` : "failed"
    }.`,
    refs: [
      { kind: "execution", id: execution.id },
      ...(root ? [{ kind: "event" as const, id: root.id }] : []),
    ],
  };

  const evidence: Finding[] = [];

  if (origin && origin.id !== root?.id) {
    const originStatus = httpStatusOf(origin);

    const error = isRecord(origin.metadata) ? origin.metadata.error : null;

    evidence.push({
      statement: `The failure originates at "${origin.title}" (+${offsetMs(
        origin,
        execution,
      )}ms)${
        originStatus
          ? `, which returned ${originStatus}`
          : typeof error === "string"
            ? `: ${error}`
            : ""
      }.`,
      refs: [{ kind: "event", id: origin.id }],
    });
  }

  if (execution.fingerprintId) {
    const fingerprint = getFingerprintById(execution.fingerprintId);

    if (fingerprint) {
      evidence.push({
        statement:
          fingerprint.count > 1
            ? `This failure has occurred ${fingerprint.count} times since ${fingerprint.firstSeenAt}.`
            : "This is the first time this failure has been seen.",
        refs: [{ kind: "fingerprint", id: fingerprint.id }],
      });
    }
  }

  const lastGood = root ? findLastKnownGood(execution, rootTitle) : null;

  const lastGoodRoot = lastGood?.rootEventId
    ? getExecutionGraphById(lastGood.id)?.events.find(
        (event) => event.id === lastGood.rootEventId,
      )
    : undefined;

  if (lastGood) {
    evidence.push({
      statement: `The same endpoint last succeeded at ${lastGood.startedAt}.`,
      refs: [{ kind: "execution", id: lastGood.id }],
    });
  }

  const hypotheses: Hypothesis[] = [];

  // Hypothesis: a failing dependency causes the failure.
  const failedDependencies = events.filter(
    (event) =>
      event.type === "http.dependency" &&
      event.status === "error" &&
      graph.failurePath.includes(event.id),
  );

  for (const dependency of failedDependencies) {
    const healthy = findHealthyDependencyResponse(dependency.title);

    const mutation: Mutation = {
      target: "dependency",
      op: "set",
      match: dependency.title,
      override: healthy
        ? {
            status: healthy.status,
            body: healthy.body,
          }
        : {
            status: 200,
            body: {},
          },
    };

    hypotheses.push({
      id: `dependency:${dependency.id}`,
      statement: `The failure is caused by ${dependency.title} failing${
        httpStatusOf(dependency) ? ` with ${httpStatusOf(dependency)}` : ""
      }.`,
      refs: [
        { kind: "event", id: dependency.id },
        ...(healthy ? [{ kind: "event" as const, id: healthy.eventId }] : []),
      ],
      experiment: {
        label: "investigate: dependency succeeds",
        mutations: [mutation],
        description: healthy
          ? `Replay with ${dependency.title} answering like its last successful call (${healthy.status}).`
          : `Replay with ${dependency.title} answering 200.`,
      },
    });
  }

  // Hypothesis: the input differs from the last successful request.
  if (root && lastGoodRoot) {
    const mutations = findReplayChanges(
      root.payload,
      lastGoodRoot.payload,
      "payload",
    )
      .flatMap((change): Mutation[] => {
        const path = toMutationPath(change.path);

        if (!path) {
          return [];
        }

        return change.type === "removed"
          ? [{ target: "payload", op: "remove", path }]
          : [{ target: "payload", op: "set", path, value: change.replay }];
      })
      .slice(0, MAX_INPUT_MUTATIONS);

    if (mutations.length > 0) {
      hypotheses.push({
        id: "input:last-known-good",
        statement: `The request input causes the failure: it differs from the last successful request in ${mutations.length} ${
          mutations.length === 1 ? "field" : "fields"
        }.`,
        refs: [
          { kind: "event", id: root.id },
          { kind: "event", id: lastGoodRoot.id },
        ],
        experiment: {
          label: "investigate: last good input",
          mutations,
          description: `Replay with ${mutations
            .map(describeMutation)
            .join(", ")}.`,
        },
      });
    }
  }

  return {
    executionId: execution.id,
    observation,
    evidence,
    hypotheses,
  };
}

/**
 * Tests each hypothesis by running its experiment (a replay with
 * dependencies answered from recordings) and comparing the result with
 * the original execution.
 */
export async function testHypotheses(
  investigation: Investigation,
): Promise<HypothesisResult[]> {
  const loaded = getExecutionGraphById(investigation.executionId);

  const rootEventId = loaded?.execution.rootEventId;

  const results: HypothesisResult[] = [];

  for (const hypothesis of investigation.hypotheses) {
    if (!rootEventId) {
      break;
    }

    const replay = await runReplay({
      eventId: rootEventId,
      label: hypothesis.experiment.label,
      mutations: hypothesis.experiment.mutations,
      dependencyMode: "recorded",
    });

    const body = replay.body.replay as
      | { id: string; resultExecutionId: string | null }
      | undefined;

    if (replay.status !== 200 || !body?.resultExecutionId) {
      results.push({
        hypothesisId: hypothesis.id,
        status: "inconclusive",
        outcome: null,
        statement:
          typeof replay.body.error === "string"
            ? `The experiment could not run: ${replay.body.error}`
            : "The experiment ran, but the target did not capture it.",
        refs: body ? [{ kind: "replay", id: body.id }] : [],
      });

      continue;
    }

    const diff = compareExecutions(
      investigation.executionId,
      body.resultExecutionId,
    );

    const refs: EvidenceRef[] = [
      { kind: "replay", id: body.id },
      { kind: "execution", id: body.resultExecutionId },
    ];

    if (diff?.outcome === "fixed") {
      results.push({
        hypothesisId: hypothesis.id,
        status: "confirmed",
        outcome: diff.outcome,
        statement: `Confirmed: ${hypothesis.experiment.description.replace(/\.$/, "")} turns the failure into a success.`,
        refs,
      });
    } else {
      results.push({
        hypothesisId: hypothesis.id,
        status: "rejected",
        outcome: diff?.outcome ?? null,
        statement:
          diff?.outcome === "different_failure"
            ? "Rejected: the execution still fails, differently."
            : "Rejected: the failure still reproduces.",
        refs,
      });
    }
  }

  return results;
}

export function concludeInvestigation(results: HypothesisResult[]) {
  const confirmed = results.filter((result) => result.status === "confirmed");

  if (confirmed.length > 0) {
    return confirmed.map((result) => result.statement).join(" ");
  }

  if (results.length === 0) {
    return "No testable hypothesis: capture dependencies with rewindFetch or a successful request to the same endpoint to give the investigation more evidence.";
  }

  return "No hypothesis turned the failure into a success; it likely depends on something Rewind has not captured yet (state, configuration or an unrecorded dependency).";
}
