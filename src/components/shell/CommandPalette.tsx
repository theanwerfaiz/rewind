"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import {
  ArrowRight,
  CornerDownLeft,
  FlaskConical,
  GitCompareArrows,
  Keyboard,
  Package,
  Search,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { StatusDot } from "@/components/ui/StatusBadge";
import type { SearchResult, SearchResultKind } from "@/lib/search";

import { NAVIGATION } from "./navigation";

/** "g" then a key jumps to a page, like GitHub and Linear. */
export const GO_SHORTCUTS: { key: string; href: string; label: string }[] = [
  { key: "o", href: "/", label: "Overview" },
  { key: "e", href: "/executions", label: "Executions" },
  { key: "f", href: "/fingerprints", label: "Failures" },
  { key: "l", href: "/lab", label: "Replay Lab" },
  { key: "d", href: "/executions/compare", label: "Compare" },
  { key: "c", href: "/capsules", label: "Capsules" },
  { key: "v", href: "/verifications", label: "Verifications" },
  { key: "n", href: "/events", label: "Events" },
  { key: "r", href: "/replays", label: "Replays" },
  { key: "s", href: "/settings", label: "Settings" },
];

const ACTIONS: { label: string; href: string; icon: LucideIcon; keywords: string }[] = [
  {
    label: "Start an experiment in the Replay Lab",
    href: "/lab",
    icon: FlaskConical,
    keywords: "replay lab experiment mutate",
  },
  {
    label: "Compare two executions",
    href: "/executions/compare",
    icon: GitCompareArrows,
    keywords: "diff compare",
  },
  {
    label: "Verify recorded failures against this build",
    href: "/verifications",
    icon: ShieldCheck,
    keywords: "verify ci regression",
  },
  {
    label: "Import a capsule",
    href: "/capsules",
    icon: Package,
    keywords: "capsule import upload file",
  },
];

const KIND_LABELS: Record<SearchResultKind, string> = {
  execution: "Execution",
  failure: "Failure",
  event: "Event",
  replay: "Replay",
  capsule: "Capsule",
};

function subscribeToNothing() {
  return () => {};
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    target.closest(".cm-editor") !== null
  );
}

function matches(query: string, ...fields: string[]) {
  const needle = query.trim().toLowerCase();

  return needle === "" || fields.some((field) => field.toLowerCase().includes(needle));
}

const itemClass =
  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-2 data-[selected=true]:bg-raised data-[selected=true]:text-ink";

const groupClass =
  "px-2 pb-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-faint";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-raised px-1 font-mono text-xs text-ink-2">
      {children}
    </kbd>
  );
}

/**
 * ⌘K palette: search executions, failures, replays and capsules, jump to
 * any ID, or run a common action. Also installs the global shortcuts
 * ("/" to search, "g" then a key to navigate, "?" for help).
 */
export function CommandPalette() {
  const router = useRouter();

  const [open, setOpen] = useState(false);

  const [helpOpen, setHelpOpen] = useState(false);

  const [query, setQuery] = useState("");

  const [results, setResults] = useState<SearchResult[]>([]);

  const [loading, setLoading] = useState(false);

  const pendingGo = useRef<number | null>(null);

  const isMac = useSyncExternalStore(
    subscribeToNothing,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => true,
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) {
        return;
      }

      if (pendingGo.current !== null) {
        window.clearTimeout(pendingGo.current);
        pendingGo.current = null;

        const target = GO_SHORTCUTS.find((shortcut) => shortcut.key === event.key);

        if (target) {
          event.preventDefault();
          router.push(target.href);
        }

        return;
      }

      if (event.key === "g") {
        pendingGo.current = window.setTimeout(() => {
          pendingGo.current = null;
        }, 1200);
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        setOpen(true);
        return;
      }

      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed === "") {
      return;
    }

    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      setLoading(true);

      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });

        const data = await response.json();

        setResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        // Aborted by a newer query, or the server is down: keep what we had.
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 150);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  // Results and the spinner belong to the query that is still typed.
  const hasQuery = query.trim() !== "";

  const visibleResults = hasQuery ? results : [];

  const searching = hasQuery && loading;

  const pages = NAVIGATION.flatMap((group) => group.items).filter((item) =>
    matches(query, item.label, item.href),
  );

  const actions = ACTIONS.filter((action) => matches(query, action.label, action.keywords));

  const showHelpItem = matches(query, "keyboard shortcuts help");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-line bg-panel px-3 text-sm text-muted transition hover:border-line-strong hover:text-ink-2"
      >
        <Search size={15} />
        <span className="flex-1 truncate text-left">Search or jump to an ID…</span>
        <span className="hidden items-center gap-0.5 sm:flex">
          <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <Command.Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);

          if (!next) {
            setQuery("");
          }
        }}
        label="Command palette"
        shouldFilter={false}
        loop
        overlayClassName="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        contentClassName="fixed left-1/2 outline-none top-[12vh] z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-line-strong bg-panel shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={16} className="shrink-0 text-muted" />

          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search executions, failures, replays… or paste an ID"
            className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
          />

          {searching && <span className="text-xs text-faint">Searching…</span>}
        </div>

        <Command.List className="max-h-[min(60vh,440px)] overflow-y-auto py-1">
          <Command.Empty className="px-4 py-8 text-center text-sm text-muted">
            {searching ? "Searching…" : "No matches."}
          </Command.Empty>

          {visibleResults.length > 0 && (
            <Command.Group heading="Results" className={groupClass}>
              {visibleResults.map((result) => (
                <Command.Item
                  key={`${result.kind}:${result.id}`}
                  value={`${result.kind}:${result.id}`}
                  onSelect={() => go(result.href)}
                  className={itemClass}
                >
                  {result.status ? (
                    <StatusDot status={result.status} />
                  ) : (
                    <span className="h-2 w-2 shrink-0" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-ink">{result.title}</div>
                    <div className="truncate font-mono text-xs text-muted">
                      {result.subtitle}
                    </div>
                  </div>

                  <span className="shrink-0 rounded bg-canvas px-1.5 py-0.5 text-xs text-muted">
                    {KIND_LABELS[result.kind]}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {actions.length > 0 && (
            <Command.Group heading="Actions" className={groupClass}>
              {actions.map((action) => {
                const Icon = action.icon;

                return (
                  <Command.Item
                    key={action.label}
                    value={`action:${action.label}`}
                    onSelect={() => go(action.href)}
                    className={itemClass}
                  >
                    <Icon size={16} className="shrink-0 text-muted" />
                    <span className="flex-1 truncate">{action.label}</span>
                  </Command.Item>
                );
              })}

              {showHelpItem && (
                <Command.Item
                  value="action:keyboard shortcuts"
                  onSelect={() => {
                    setOpen(false);
                    setHelpOpen(true);
                  }}
                  className={itemClass}
                >
                  <Keyboard size={16} className="shrink-0 text-muted" />
                  <span className="flex-1">Keyboard shortcuts</span>
                  <Kbd>?</Kbd>
                </Command.Item>
              )}
            </Command.Group>
          )}

          {pages.length > 0 && (
            <Command.Group heading="Go to" className={groupClass}>
              {pages.map((item) => {
                const Icon = item.icon;

                const shortcut = GO_SHORTCUTS.find((entry) => entry.href === item.href);

                return (
                  <Command.Item
                    key={item.href}
                    value={`page:${item.href}`}
                    onSelect={() => go(item.href)}
                    className={itemClass}
                  >
                    <Icon size={16} className="shrink-0 text-muted" />
                    <span className="flex-1">{item.label}</span>
                    {shortcut && (
                      <span className="flex items-center gap-0.5">
                        <Kbd>g</Kbd>
                        <Kbd>{shortcut.key}</Kbd>
                      </span>
                    )}
                  </Command.Item>
                );
              })}
            </Command.Group>
          )}
        </Command.List>

        <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-xs text-faint">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>
              <CornerDownLeft size={11} />
            </Kbd>{" "}
            open
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>esc</Kbd> close
          </span>
        </div>
      </Command.Dialog>

      <Dialog.Root open={helpOpen} onOpenChange={setHelpOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />

          <Dialog.Content className="fixed left-1/2 outline-none top-[12vh] z-50 w-[min(480px,calc(100vw-32px))] -translate-x-1/2 rounded-xl border border-line-strong bg-panel p-5 shadow-2xl">
            <Dialog.Title className="text-sm font-medium text-ink">
              Keyboard shortcuts
            </Dialog.Title>

            <Dialog.Description className="mt-1 text-xs text-muted">
              Shortcuts are ignored while you type in a field.
            </Dialog.Description>

            <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm">
              <dt className="text-ink-2">Search and commands</dt>
              <dd className="flex gap-0.5">
                <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
                <Kbd>K</Kbd>
                <span className="px-1 text-faint">or</span>
                <Kbd>/</Kbd>
              </dd>

              {GO_SHORTCUTS.map((shortcut) => (
                <div key={shortcut.key} className="contents">
                  <dt className="flex items-center gap-2 text-ink-2">
                    <ArrowRight size={13} className="text-faint" />
                    {shortcut.label}
                  </dt>
                  <dd className="flex gap-0.5">
                    <Kbd>g</Kbd>
                    <Kbd>{shortcut.key}</Kbd>
                  </dd>
                </div>
              ))}

              <dt className="text-ink-2">Move through the execution graph</dt>
              <dd className="flex gap-0.5">
                <Kbd>j</Kbd>
                <Kbd>k</Kbd>
              </dd>

              <dt className="text-ink-2">Fold and unfold a graph node</dt>
              <dd className="flex gap-0.5">
                <Kbd>h</Kbd>
                <Kbd>l</Kbd>
              </dd>

              <dt className="text-ink-2">This help</dt>
              <dd>
                <Kbd>?</Kbd>
              </dd>
            </dl>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
