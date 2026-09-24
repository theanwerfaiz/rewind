import Link from "next/link";
import { connection } from "next/server";

import { CapsuleImporter } from "@/components/capsules/CapsuleImporter";
import { getCapsuleImports } from "@/lib/capsule-store";

function formatDateTime(timestamp: string) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CapsulesPage() {
  await connection();

  const imports = getCapsuleImports();

  return (
    <main className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <Link
          href="/executions"
          className="text-sm text-slate-500 transition hover:text-slate-200"
        >
          ← Executions
        </Link>

        <div className="mb-8 mt-5">
          <h1 className="text-3xl font-semibold tracking-tight">Capsules</h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            A Reproduction Capsule is a portable file holding one execution, its
            events, recorded dependencies and replay instructions. Export one
            from any execution; import one to reproduce it here.
          </p>
        </div>

        <CapsuleImporter />

        <section className="mt-8 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d1320]">
          <h2 className="border-b border-white/[0.06] px-5 py-4 text-sm font-medium text-slate-200">
            Imported capsules
          </h2>

          {imports.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-slate-600">
              No capsules imported yet.
            </p>
          ) : (
            imports.map((record) => (
              <Link
                key={record.id}
                href={`/executions/${record.executionId}`}
                className="group flex items-center gap-4 border-b border-white/[0.05] px-5 py-3.5 transition last:border-0 hover:bg-white/[0.03]"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    record.status === "error" ? "bg-red-400" : "bg-emerald-400"
                  }`}
                />

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-200 group-hover:text-white">
                    {record.rootTitle ?? record.executionId}
                  </div>

                  <div className="mt-0.5 truncate font-mono text-[11px] text-slate-600">
                    {record.id}
                  </div>
                </div>

                <span className="shrink-0 text-xs text-slate-600">
                  imported {formatDateTime(record.importedAt)}
                </span>
              </Link>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
