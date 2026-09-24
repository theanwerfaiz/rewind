import Link from "next/link";

import { PageHeader } from "@/components/ui/PageHeader";
import { buttonClass, Panel } from "@/components/ui/primitives";
import { StatusDot } from "@/components/ui/StatusBadge";
import { getExecutions, type RewindExecution } from "@/lib/executions";
import { formatRelative, shortId } from "@/lib/format";
import { getRecentExperiments } from "@/lib/replays";

function optionLabel(execution: RewindExecution) {
  return `${execution.status === "error" ? "✕" : "✓"} ${shortId(execution.id)} · ${
    execution.rootTitle ?? "execution"
  }${execution.isReplay ? " · replay" : ""} · ${formatRelative(execution.startedAt)}`;
}

const selectClass =
  "h-10 w-full min-w-0 rounded-lg border border-line bg-canvas px-3 text-sm text-ink outline-none focus:border-accent";

/** Shown at /executions/compare when no pair is chosen yet. */
export function ComparePicker({
  original,
  candidate,
}: {
  original?: string;
  candidate?: string;
}) {
  const executions = getExecutions(100);

  const pairs = getRecentExperiments(200)
    .filter(
      (experiment) => experiment.sourceExecutionId && experiment.resultExecutionId,
    )
    .slice(0, 10);

  const originals = executions.filter((execution) => !execution.isReplay);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Executions", href: "/executions" }, { label: "Compare" }]}
        title="Compare executions"
        description="Pick two executions to see what changed: events added or removed, statuses, responses and timing."
      />

      <Panel title="Choose a pair">
        <form
          action="/executions/compare"
          className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
        >
          <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
            Original
            <select
              name="original"
              required
              defaultValue={original ?? originals.find((item) => item.status === "error")?.id ?? ""}
              className={selectClass}
            >
              <option value="" disabled>
                Choose an execution…
              </option>
              {executions.map((execution) => (
                <option key={execution.id} value={execution.id}>
                  {optionLabel(execution)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
            Candidate
            <select
              name="candidate"
              required
              defaultValue={candidate ?? ""}
              className={selectClass}
            >
              <option value="" disabled>
                Choose an execution…
              </option>
              {executions.map((execution) => (
                <option key={execution.id} value={execution.id}>
                  {optionLabel(execution)}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" className={`${buttonClass("primary")} h-10`}>
            Compare
          </button>
        </form>
      </Panel>

      <Panel
        className="mt-6"
        title="Suggested"
        description="Each experiment against the request it replayed"
        flush
      >
        {pairs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">
            Run an experiment in the Replay Lab and it will appear here.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {pairs.map((experiment) => (
              <li key={experiment.id}>
                <Link
                  href={`/executions/compare?original=${experiment.sourceExecutionId}&candidate=${experiment.resultExecutionId}`}
                  className="flex items-center gap-3 px-4 py-3 text-sm transition hover:bg-raised"
                >
                  <StatusDot status={experiment.status < 400 ? "success" : "error"} />

                  <span className="min-w-0 flex-1 truncate text-ink">
                    {experiment.eventTitle ?? experiment.url}
                    <span className="text-muted">
                      {" "}
                      vs {experiment.label ?? (experiment.mutations.length === 0 ? "plain replay" : "experiment")}
                    </span>
                  </span>

                  <span className="font-mono text-xs text-muted">
                    {shortId(experiment.sourceExecutionId!)} →{" "}
                    {shortId(experiment.resultExecutionId!)}
                  </span>

                  <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-muted">
                    {formatRelative(experiment.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
