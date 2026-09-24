"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { RewindLogo } from "@/components/icons/RewindLogo";

import { SidebarNav } from "./Sidebar";

/**
 * The bar above every page. On small screens it holds the menu button that
 * opens navigation in a drawer; the command palette mounts here too.
 */
export function TopBar({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const pathname = usePathname();

  // The sign-in page stands alone: no navigation, search or live stream.
  if (pathname === "/login") {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur md:px-6">
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 transition hover:bg-raised hover:text-ink lg:hidden"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </Dialog.Trigger>

        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />

          <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-line bg-sidebar">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>

            <div className="flex h-14 items-center justify-between border-b border-line px-5">
              <RewindLogo />

              <Dialog.Close
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink"
                aria-label="Close navigation"
              >
                <X size={16} />
              </Dialog.Close>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-5">
              <SidebarNav onNavigate={() => setOpen(false)} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Link href="/" className="lg:hidden" aria-label="Rewind overview">
        <RewindLogo showText={false} />
      </Link>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        {children}
      </div>
    </header>
  );
}
