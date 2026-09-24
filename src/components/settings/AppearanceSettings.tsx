"use client";

import { useSyncExternalStore } from "react";

import {
  applyDensity,
  applyTheme,
  DENSITY_KEY,
  readPreference,
  subscribePreferences,
  THEME_KEY,
  type DensityPreference,
  type ThemePreference,
} from "@/lib/preferences";

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

const DENSITIES: { value: DensityPreference; label: string }[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg border border-line bg-canvas p-0.5 text-sm"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-md px-3 py-1.5 transition ${
            value === option.value ? "bg-raised text-ink" : "text-muted hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Theme and density are per browser, so they are not stored in SQLite. */
export function AppearanceSettings() {
  const theme = useSyncExternalStore<ThemePreference>(
    subscribePreferences,
    () => readPreference(THEME_KEY, ["dark", "light", "system"] as const, "dark"),
    () => "dark",
  );

  const density = useSyncExternalStore<DensityPreference>(
    subscribePreferences,
    () =>
      readPreference(DENSITY_KEY, ["comfortable", "compact"] as const, "comfortable"),
    () => "comfortable",
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm text-ink">Theme</div>
          <div className="text-xs text-muted">System follows your operating system.</div>
        </div>

        <Segmented
          label="Theme"
          options={THEMES}
          value={theme}
          onChange={applyTheme}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm text-ink">Density</div>
          <div className="text-xs text-muted">Compact fits more rows on screen.</div>
        </div>

        <Segmented
          label="Density"
          options={DENSITIES}
          value={density}
          onChange={applyDensity}
        />
      </div>
    </div>
  );
}
