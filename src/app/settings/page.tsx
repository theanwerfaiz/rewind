import fs from "node:fs";

import type { Metadata } from "next";
import { connection } from "next/server";

import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { WorkspaceSettingsForm } from "@/components/settings/WorkspaceSettingsForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/primitives";
import db from "@/lib/db";
import { REDACTED_HEADERS } from "@/lib/redaction";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Settings",
};

const COUNTED_TABLES = [
  ["events", "Events"],
  ["executions", "Executions"],
  ["replays", "Replays and experiments"],
  ["failure_fingerprints", "Failure fingerprints"],
  ["capsule_imports", "Imported capsules"],
  ["verification_runs", "Verification runs"],
] as const;

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.round(bytes / 1024)} KB`;
}

function getStorage() {
  const counts = COUNTED_TABLES.map(([table, label]) => {
    try {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
        count: number;
      };

      return { label, count: row.count };
    } catch {
      return { label, count: null };
    }
  });

  let bytes = 0;

  for (const suffix of ["", "-wal"]) {
    try {
      bytes += fs.statSync(`${db.name}${suffix}`).size;
    } catch {
      // No write-ahead log yet.
    }
  }

  return { counts, bytes, path: db.name };
}

export default async function SettingsPage() {
  await connection();

  const settings = getSettings();

  const storage = getStorage();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Workspace" }, { label: "Settings" }]}
        title="Settings"
        description="Redaction and replay defaults apply to everyone using this Rewind. Appearance is saved in this browser."
      />

      <div className="space-y-6">
        <Panel
          title="Redaction and replay"
          description="Applied when events are stored, on top of what the capture client already redacted"
        >
          <WorkspaceSettingsForm
            settings={settings}
            builtInHeaders={[...REDACTED_HEADERS]}
          />
        </Panel>

        <Panel title="Appearance" description="Saved in this browser only">
          <AppearanceSettings />
        </Panel>

        <Panel title="Storage" description={`SQLite · ${formatBytes(storage.bytes)}`}>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {storage.counts.map((item) => (
              <div key={item.label}>
                <dt className="text-xs text-muted">{item.label}</dt>
                <dd className="mt-1 font-mono text-lg tabular-nums text-ink">
                  {item.count === null ? "—" : item.count.toLocaleString()}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 break-all font-mono text-xs text-faint">{storage.path}</p>
        </Panel>
      </div>
    </>
  );
}
