import type { Metadata } from "next";
import { connection } from "next/server";

import { SignOutButton } from "@/components/auth/LoginForm";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { WorkspaceSettingsForm } from "@/components/settings/WorkspaceSettingsForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/primitives";
import { getAccessToken } from "@/lib/access";
import db from "@/lib/db";
import { REDACTED_HEADERS } from "@/lib/redaction";
import { getSettings } from "@/lib/settings";
import { REWIND_VERSION } from "@/lib/version";

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

  // Asked of SQLite rather than the filesystem, so the build does not
  // trace the whole project; excludes the write-ahead log.
  const pageCount = db.pragma("page_count", { simple: true }) as number;

  const pageSize = db.pragma("page_size", { simple: true }) as number;

  const bytes = pageCount * pageSize;

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

        <Panel
          title="Access"
          description={
            getAccessToken()
              ? "Protected: pages and APIs need REWIND_ACCESS_TOKEN"
              : "Open: anyone who can reach this server can use it"
          }
        >
          {getAccessToken() ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                Capture clients and <code className="font-mono">npm run verify</code> send
                the token as a bearer header; webhook senders add{" "}
                <code className="font-mono">?token=…</code> to the capture URL.
              </p>
              <SignOutButton />
            </div>
          ) : (
            <p className="text-sm text-muted">
              Fine on your own machine. Before exposing Rewind on a network, set{" "}
              <code className="font-mono">REWIND_ACCESS_TOKEN</code> on the Rewind server and
              on every app that captures to it.
            </p>
          )}
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

          <p className="mt-4 break-all font-mono text-xs text-faint">
            {storage.path} · Rewind v{REWIND_VERSION}
          </p>
        </Panel>
      </div>
    </>
  );
}
