"use client";

import {
  Activity,
  AlertTriangle,
  GitBranch,
  List,
  Package,
  Play,
  Settings,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { RewindLogo } from "../icons/RewindLogo";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
};

const navigation: NavItem[] = [
  {
    label: "Events",
    href: "/",
    icon: List,
  },
  {
    label: "Executions",
    href: "/executions",
    icon: GitBranch,
  },
  {
    label: "Timeline",
    href: "/timeline",
    icon: Activity,
  },
  {
    label: "Failures",
    href: "/fingerprints",
    icon: AlertTriangle,
  },
  {
    label: "Replays",
    href: "/replays",
    icon: Play,
  },
  {
    label: "Capsules",
    href: "/capsules",
    icon: Package,
  },
  {
    label: "Verifications",
    href: "/verifications",
    icon: ShieldCheck,
  },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-[240px] shrink-0 flex-col border-r border-white/[0.07] bg-[#090e18]">
      <div className="flex h-[72px] items-center border-b border-white/[0.07] px-5">
        <RewindLogo />
      </div>

      <div className="flex-1 px-3 py-5">
        <div className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Workspace
        </div>

        <nav className="space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;

            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  active
                    ? "bg-blue-500/15 text-blue-300"
                    : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                }`}
              >
                <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />

                <span className="flex-1 text-left">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mb-3 mt-8 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          System
        </div>

        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-200">
          <Settings size={17} strokeWidth={1.8} />
          <span>Settings</span>
        </button>
      </div>

      <div className="border-t border-white/[0.07] p-3">
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />

            <span className="text-xs font-medium text-slate-300">Local</span>
          </div>

          <div className="mt-2 text-[11px] text-slate-500">Rewind v0.1.0</div>
        </div>
      </div>
    </aside>
  );
}
