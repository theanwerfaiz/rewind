"use client";

import { Bell, ChevronDown, Plus, Search } from "lucide-react";

export function Header() {
  return (
    <header className="flex h-[72px] items-center gap-4 border-b border-white/[0.07] bg-[#090e18]/95 px-6 backdrop-blur">
      <div className="relative max-w-[520px] flex-1">
        <Search
          size={17}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
        />

        <input
          type="text"
          placeholder="Search events, requests, errors..."
          className="h-10 w-full rounded-lg border border-white/[0.08] bg-white/[0.025] pl-10 pr-16 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-blue-500/40 focus:bg-white/[0.04]"
        />

        <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
          <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-slate-500">
            ⌘
          </kbd>
          <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-slate-500">
            K
          </kbd>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button className="flex h-10 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 text-xs text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-200">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Local
          <ChevronDown size={14} />
        </button>

        <button className="flex h-10 items-center gap-2 rounded-lg bg-blue-500 px-3.5 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400">
          <Plus size={16} />
          Capture
        </button>

        <button className="ml-1 flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300">
          <Bell size={17} />
        </button>

        <button className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-800 text-xs font-semibold text-slate-200">
          D
        </button>
      </div>
    </header>
  );
}
