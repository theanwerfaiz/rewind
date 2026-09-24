"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useState } from "react";

export type WorkspaceTab = {
  value: string;
  label: string;
  count?: number;
  tone?: "failure" | "success";
  content: React.ReactNode;
};

/**
 * Tabs whose selection is kept in the URL (?tab=), so a link or a reload
 * lands on the same view. Content is rendered by the server and passed in.
 */
export function WorkspaceTabs({
  tabs,
  initial,
}: {
  tabs: WorkspaceTab[];
  initial?: string;
}) {
  const [value, setValue] = useState(
    tabs.some((tab) => tab.value === initial) ? initial! : tabs[0].value,
  );

  function change(next: string) {
    setValue(next);

    const url = new URL(window.location.href);

    if (next === tabs[0].value) {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", next);
    }

    window.history.replaceState(null, "", url);
  }

  return (
    <Tabs.Root value={value} onValueChange={change}>
      <Tabs.List
        aria-label="Execution views"
        className="mb-4 flex gap-1 overflow-x-auto border-b border-line"
      >
        {tabs.map((tab) => (
          <Tabs.Trigger
            key={tab.value}
            value={tab.value}
            className="-mb-px flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-sm text-muted transition hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink"
          >
            {tab.label}

            {tab.count !== undefined && (
              <span
                className={`rounded-full px-1.5 font-mono text-xs tabular-nums ${
                  tab.tone === "failure"
                    ? "bg-failure-soft text-failure"
                    : tab.tone === "success"
                      ? "bg-success-soft text-success"
                      : "bg-raised text-muted"
                }`}
              >
                {tab.count}
              </span>
            )}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      {tabs.map((tab) => (
        <Tabs.Content key={tab.value} value={tab.value} className="outline-none">
          {tab.content}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
