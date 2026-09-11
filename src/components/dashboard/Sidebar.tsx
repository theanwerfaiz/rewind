"use client";

import {
  Activity,
  AlertTriangle,
  FileCode2,
  GitBranch,
  List,
  Play,
  Settings,
  Webhook,
} from "lucide-react";
import { RewindLogo } from "../icons/RewindLogo";

type NavItem = {
  label: string;
  icon: React.ElementType;
  active?: boolean;
  badge?: string;
};

const navigation: NavItem[] = [
  {
    label: "Events",
    icon: List,
    active: true,
  },
  {
    label: "Timeline",
    icon: Activity,
  },
  {
    label: "Webhooks",
    icon: Webhook,
    badge: "12",
  },
  {
    label: "Errors",
    icon: AlertTriangle,
    badge: "3",
  },
  {
    label: "Replays",
    icon: Play,
  },
  {
    label: "Tests",
    icon: FileCode2,
  },
];

export function Sidebar() {
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

            return (
              <button
                key={item.label}
                className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  item.active
                    ? "bg-blue-500/15 text-blue-300"
                    : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                }`}
              >
                <Icon size={17} strokeWidth={item.active ? 2.2 : 1.8} />

                <span className="flex-1 text-left">{item.label}</span>

                {item.badge && (
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] ${
                      item.active
                        ? "bg-blue-500/20 text-blue-300"
                        : "bg-white/[0.05] text-slate-500"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
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
