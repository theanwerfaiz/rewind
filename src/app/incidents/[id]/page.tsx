import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import {
  IncidentNotes,
  IncidentStatusButton,
  UnlinkExecutionButton,
} from "@/components/incidents/IncidentEditor";
import { EventIcon } from "@/components/ui/EventIcon";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/primitives";
import { Badge, StatusDot } from "@/components/ui/StatusBadge";
import { formatDateTime, formatRelative, formatSpan, shortId } from "@/lib/format";
import { getIncidentById } from "@/lib/incidents";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const found = getIncidentById(id);

  return {
    title: found ? `Incident · ${found.incident.title}` : "Incident not found",
  };
}

export default async function IncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();

  const { id } = await params;

  const result = getIncidentById(id);

  if (!result) {
    notFound();
  }

  const { incident, executions } = result;

  const failed = executions.filter((execution) => execution.status === "error").length;

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Incidents", href: "/incidents" },
          { label: shortId(incident.id) },
        ]}
        badges={
          <Badge tone={incident.status === "open" ? "failure" : "success"}>
            {incident.status}
          </Badge>
        }
        title={incident.title}
        meta={
          <>
            <span>opened {formatDateTime(incident.createdAt)}</span>
            <span>updated {formatRelative(incident.updatedAt)}</span>
          </>
        }
        actions={<IncidentStatusButton id={incident.id} status={incident.status} />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel
          title="Executions"
          description={
            executions.length === 0
              ? "Add executions from their page with the Incident button"
              : `${executions.length} linked · ${failed} failed`
          }
          flush
        >
          {executions.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">
              No executions linked yet.{" "}
              <Link href="/executions?q=is%3Afailed" className="text-accent">
                Find failed executions
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {executions.map((execution) => (
                <li key={execution.id} className="flex items-center gap-2 pr-2">
                  <Link
                    href={`/executions/${execution.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition hover:bg-raised"
                  >
                    <EventIcon
                      type={execution.rootType ?? "http.request"}
                      status={execution.status}
                      size="sm"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-ink">
                        {execution.rootTitle ?? execution.id}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-xs text-muted">
                        {shortId(execution.id)} · {formatSpan(execution.startedAt, execution.endedAt)} ·{" "}
                        {formatRelative(execution.startedAt)}
                      </div>
                    </div>

                    <StatusDot status={execution.status} />
                  </Link>

                  <UnlinkExecutionButton incidentId={incident.id} executionId={execution.id} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Notes">
          <IncidentNotes id={incident.id} notes={incident.notes} />
        </Panel>
      </div>
    </>
  );
}
