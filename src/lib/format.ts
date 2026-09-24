/**
 * Display formatting shared by every page, so durations, dates and IDs
 * read the same everywhere.
 */

export function formatMs(ms: number) {
  if (ms >= 10_000) {
    return `${(ms / 1000).toFixed(0)}s`;
  }

  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }

  return `${Math.round(ms)}ms`;
}

export function formatSpan(startedAt: string, endedAt: string) {
  return formatMs(Math.max(Date.parse(endedAt) - Date.parse(startedAt), 0));
}

export function formatDateTime(timestamp: string) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** "just now", "4m ago", "3h ago", "2d ago", then a date. */
export function formatRelative(timestamp: string, now = Date.now()) {
  const seconds = Math.round((now - Date.parse(timestamp)) / 1000);

  if (seconds < 45) {
    return "just now";
  }

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);

  if (days < 7) {
    return `${days}d ago`;
  }

  return new Date(timestamp).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

/**
 * Shortens a Rewind ID for display, keeping its prefix:
 * "exe_60235b91-704d-…" → "exe_60235b91".
 */
export function shortId(id: string, length = 8) {
  const separator = id.indexOf("_");

  if (separator === -1) {
    return id.length > length ? id.slice(0, length) : id;
  }

  const prefix = id.slice(0, separator + 1);

  const rest = id.slice(separator + 1);

  return rest.length > length ? `${prefix}${rest.slice(0, length)}` : id;
}
