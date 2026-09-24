"use client";

import { CircleAlert, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import type { LiveExecution } from "@/lib/live";

type Toast = {
  id: string;
  title: string;
  href: string;
};

/** Pages whose lists should pick up new executions as they arrive. */
const LIVE_PAGES = ["/", "/executions", "/fingerprints", "/events", "/timeline"];

const REFRESH_THROTTLE_MS = 3000;

const TOAST_MS = 8000;

function subscribeToNothing() {
  return () => {};
}

/**
 * Listens to /api/stream. New real failures raise a toast; list pages
 * refresh (throttled) so new executions appear without reloading.
 */
export function LiveTail() {
  const router = useRouter();

  const pathname = usePathname();

  const pathnameRef = useRef(pathname);

  const [connected, setConnected] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);

  // False while server rendering and hydrating, true afterwards.
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const source = new EventSource("/api/stream");

    // Executions already reported as failed, so an update does not toast twice.
    const failed = new Set<string>();

    let lastRefresh = 0;

    let pendingRefresh: number | undefined;

    function refresh() {
      if (!LIVE_PAGES.includes(pathnameRef.current)) {
        return;
      }

      const wait = lastRefresh + REFRESH_THROTTLE_MS - Date.now();

      if (wait <= 0) {
        lastRefresh = Date.now();
        router.refresh();
      } else if (pendingRefresh === undefined) {
        pendingRefresh = window.setTimeout(() => {
          pendingRefresh = undefined;
          lastRefresh = Date.now();
          router.refresh();
        }, wait);
      }
    }

    source.addEventListener("ready", () => setConnected(true));

    source.addEventListener("error", () => setConnected(false));

    source.addEventListener("execution", (message) => {
      let execution: LiveExecution;

      try {
        execution = JSON.parse((message as MessageEvent<string>).data);
      } catch {
        return;
      }

      refresh();

      if (execution.status !== "error" || execution.isReplay || failed.has(execution.id)) {
        return;
      }

      failed.add(execution.id);

      const toast: Toast = {
        id: execution.id,
        title: execution.title,
        href: `/executions/${execution.id}`,
      };

      setToasts((current) => [...current.slice(-2), toast]);

      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item !== toast));
      }, TOAST_MS);
    });

    return () => {
      window.clearTimeout(pendingRefresh);
      source.close();
    };
  }, [router]);

  return (
    <>
      <span
        title={
          connected
            ? "Live: new executions appear as they are captured"
            : "Not connected to the live stream"
        }
        className="hidden shrink-0 items-center gap-2 rounded-full border border-line px-2.5 py-1 text-xs text-muted sm:flex"
      >
        <span className="relative flex h-2 w-2">
          {connected && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-recorder opacity-60 motion-reduce:hidden" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              connected ? "bg-recorder" : "bg-faint"
            }`}
          />
        </span>
        {connected ? "Live" : "Offline"}
      </span>

      {/* Portalled: the top bar's backdrop blur would otherwise anchor
          fixed children to the bar instead of the viewport. */}
      {mounted &&
        createPortal(
          <div
            aria-live="polite"
            className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-32px))] flex-col gap-2"
          >
            {toasts.map((toast) => (
              <div
                key={toast.id}
                role="status"
                className="pointer-events-auto flex items-start gap-3 rounded-xl border border-failure/30 bg-panel p-3 shadow-2xl"
              >
                <CircleAlert size={16} className="mt-0.5 shrink-0 text-failure" />

                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-failure">New failure</div>

                  <Link
                    href={toast.href}
                    onClick={() =>
                      setToasts((current) => current.filter((item) => item !== toast))
                    }
                    className="mt-0.5 block truncate text-sm text-ink hover:text-accent"
                  >
                    {toast.title}
                  </Link>
                </div>

                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() =>
                    setToasts((current) => current.filter((item) => item !== toast))
                  }
                  className="text-muted hover:text-ink"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
