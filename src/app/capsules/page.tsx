import Link from "next/link";
import { connection } from "next/server";

import { CapsuleImporter } from "@/components/capsules/CapsuleImporter";
import { getCapsuleImports } from "@/lib/capsule-store";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Metadata } from "next";

function formatDateTime(timestamp: string) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const metadata: Metadata = {
  title: "Capsules",
};

export default async function CapsulesPage() {
  await connection();

  const imports = getCapsuleImports();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Prevent" }, { label: "Capsules" }]}
        title="Capsules"
        description="A Reproduction Capsule is a portable file holding one execution, its events, recorded dependencies and replay instructions. Export one from any execution; import one to reproduce it here."
      />

        <CapsuleImporter />

        <section className="mt-8 overflow-hidden rounded-2xl border border-line bg-panel">
          <h2 className="border-b border-line px-5 py-4 text-sm font-medium text-ink">
            Imported capsules
          </h2>

          {imports.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-faint">
              No capsules imported yet.
            </p>
          ) : (
            imports.map((record) => (
              <Link
                key={record.id}
                href={`/executions/${record.executionId}`}
                className="group flex items-center gap-4 border-b border-line px-5 py-3.5 transition last:border-0 hover:bg-panel"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    record.status === "error" ? "bg-failure" : "bg-success"
                  }`}
                />

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink group-hover:text-ink">
                    {record.rootTitle ?? record.executionId}
                  </div>

                  <div className="mt-0.5 truncate font-mono text-xs text-faint">
                    {record.id}
                  </div>
                </div>

                <span className="shrink-0 text-xs text-faint">
                  imported {formatDateTime(record.importedAt)}
                </span>
              </Link>
            ))
          )}
        </section>
      </>
  );
}
