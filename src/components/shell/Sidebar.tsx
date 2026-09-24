"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { RewindLogo } from "@/components/icons/RewindLogo";

import { isActive, NAVIGATION } from "./navigation";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {NAVIGATION.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <div className="px-3 pb-1 font-mono text-xs uppercase tracking-[0.14em] text-faint">
            {group.label}
          </div>

          {group.items.map((item) => {
            const Icon = item.icon;

            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-hover text-ink"
                    : "text-ink-2 hover:bg-raised hover:text-ink"
                }`}
              >
                <Icon
                  size={16}
                  strokeWidth={active ? 2.1 : 1.8}
                  className={active ? "text-accent" : "text-muted"}
                />

                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-sidebar lg:flex">
      <div className="flex h-14 items-center border-b border-line px-5">
        <Link href="/" aria-label="Rewind overview">
          <RewindLogo />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-5">
        <SidebarNav />
      </div>

      <div className="border-t border-line px-5 py-4 text-sm text-muted">
        <div className="flex items-center gap-2 text-ink-2">
          <span className="h-2 w-2 rounded-full bg-recorder shadow-[0_0_0_3px_rgba(255,138,61,0.18)]" />
          Recording locally
        </div>

        <div className="mt-1 text-xs text-faint">SQLite · data/rewind.db</div>
      </div>
    </aside>
  );
}
