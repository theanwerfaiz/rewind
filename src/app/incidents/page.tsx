import { Siren } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { NewIncidentForm } from "@/components/incidents/NewIncidentForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, Panel } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/StatusBadge";
import { formatDateTime, formatRelative } from "@/lib/format";
import { getIncidents } from "@/lib/incidents";

export const metadata: Metadata = {
  title: "Incidents",
};

export default async function IncidentsPage() {
  await connection();

  const incidents = getIncidents();

  const open = incidents.filter((incident) => incident.status === "open").length;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Monitor" }, { label: "Incidents" }]}
        title="Incidents"
        description="Group the executions behind one problem, keep notes as you investigate, and resolve it when it is fixed."
        meta={incidents.length > 0 ? <span>{open} open</span> : undefined}
      />

      <NewIncidentForm />

      {incidents.length === 0 ? (
        <EmptyState icon={<Siren size={28} />} title="No incidents">
          Open one here, or from any execution with its Incident button.
        </EmptyState>
      ) : (
        <Panel flush>
          <ul className="divide-y divide-line">
            {incidents.map((incident) => (
              <li key={incident.id}>
                <Link
                  href={`/incidents/${incident.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-raised"
                >
                  <Badge tone={incident.status === "open" ? "failure" : "success"}>
                    {incident.status}
                  </Badge>

                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {incident.title}
                  </span>

                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                    {incident.executionCount}{" "}
                    {incident.executionCount === 1 ? "execution" : "executions"}
                  </span>

                  <span
                    title={formatDateTime(incident.updatedAt)}
                    className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-muted"
                  >
                    {formatRelative(incident.updatedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
