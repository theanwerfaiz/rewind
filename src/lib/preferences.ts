/**
 * Per-browser display preferences (theme and density). They are applied as
 * attributes on <html>, before first paint by the inline script in the root
 * layout, and afterwards by the settings page.
 */

export type ThemePreference = "dark" | "light" | "system";

export type DensityPreference = "comfortable" | "compact";

export const THEME_KEY = "rewind.theme";

export const DENSITY_KEY = "rewind.density";

/** Runs in <head> before the page paints; must stay dependency-free. */
export const PREFERENCES_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="system")document.documentElement.setAttribute("data-theme",t);var d=localStorage.getItem("${DENSITY_KEY}");if(d==="compact")document.documentElement.setAttribute("data-density",d);}catch(e){}})();`;

const listeners = new Set<() => void>();

/** For useSyncExternalStore: notified whenever a preference is applied. */
export function subscribePreferences(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

export function readPreference<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  try {
    const value = window.localStorage.getItem(key);

    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

export function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;

  if (theme === "dark") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }

  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }

  notify();
}

export function applyDensity(density: DensityPreference) {
  const root = document.documentElement;

  if (density === "compact") {
    root.setAttribute("data-density", "compact");
  } else {
    root.removeAttribute("data-density");
  }

  try {
    window.localStorage.setItem(DENSITY_KEY, density);
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }

  notify();
}
