/**
 * A small filter language for the executions list, e.g.
 *
 *   status:error endpoint:/checkout since:24h -is:replay
 *
 * Terms are ANDed. `-` negates a term. Values may be quoted. Text without a
 * key matches the root title or the execution ID.
 */

export type FilterableExecution = {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string;
  environment: string | null;
  rootTitle: string | null;
  fingerprintId: string | null;
  capsuleId: string | null;
  isReplay: boolean;
};

type Comparison = { op: ">" | "<"; ms: number };

export type FilterTerm =
  | { key: "status"; value: "error" | "success"; negate: boolean }
  | { key: "is"; value: "replay" | "imported" | "failed"; negate: boolean }
  | { key: "env"; value: string; negate: boolean }
  | { key: "fp"; value: string; negate: boolean }
  | { key: "endpoint"; value: string; negate: boolean }
  | { key: "since"; ms: number; negate: boolean }
  | { key: "duration"; comparison: Comparison; negate: boolean }
  | { key: "text"; value: string; negate: boolean };

export type ParsedFilter = {
  terms: FilterTerm[];
  /** Human-readable problems, one per term that could not be understood. */
  errors: string[];
};

export const FILTER_KEYS = [
  "status:error",
  "status:success",
  "is:replay",
  "is:imported",
  "env:",
  "fp:",
  "endpoint:",
  "since:24h",
  "duration:>1s",
];

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

function parseSpan(value: string) {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/i);

  return match ? Number(match[1]) * UNIT_MS[match[2].toLowerCase()] : null;
}

/** Splits on spaces, keeping quoted values ("a b" or key:"a b") together. */
function tokenize(query: string) {
  const tokens: string[] = [];

  const pattern = /(-?[a-z]+:"[^"]*"|-?"[^"]*"|\S+)/gi;

  for (const match of query.matchAll(pattern)) {
    tokens.push(match[0]);
  }

  return tokens;
}

function unquote(value: string) {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1)
    : value;
}

export function parseExecutionFilter(query: string): ParsedFilter {
  const terms: FilterTerm[] = [];

  const errors: string[] = [];

  for (const rawToken of tokenize(query.slice(0, 500))) {
    const negate = rawToken.startsWith("-") && rawToken.length > 1;

    const token = negate ? rawToken.slice(1) : rawToken;

    const separator = token.indexOf(":");

    const key =
      separator > 0 && !token.startsWith('"')
        ? token.slice(0, separator).toLowerCase()
        : null;

    const value = unquote(key ? token.slice(separator + 1) : token);

    if (key === null) {
      if (value !== "") {
        terms.push({ key: "text", value: value.toLowerCase(), negate });
      }

      continue;
    }

    if (value === "") {
      errors.push(`"${rawToken}" needs a value.`);
      continue;
    }

    switch (key) {
      case "status": {
        const status = value.toLowerCase();

        if (status === "error" || status === "failed" || status === "fail") {
          terms.push({ key: "status", value: "error", negate });
        } else if (status === "success" || status === "ok") {
          terms.push({ key: "status", value: "success", negate });
        } else {
          errors.push(`status can be error or success, not "${value}".`);
        }

        break;
      }

      case "is": {
        const flag = value.toLowerCase();

        if (flag === "replay" || flag === "imported" || flag === "failed") {
          terms.push({ key: "is", value: flag, negate });
        } else {
          errors.push(`is can be replay, imported or failed, not "${value}".`);
        }

        break;
      }

      case "env":
      case "environment":
        terms.push({ key: "env", value: value.toLowerCase(), negate });
        break;

      case "fp":
      case "fingerprint":
        terms.push({
          key: "fp",
          value: value.toLowerCase().replace(/^fp_/, ""),
          negate,
        });
        break;

      case "endpoint":
      case "path":
        terms.push({ key: "endpoint", value: value.toLowerCase(), negate });
        break;

      case "since": {
        const ms = parseSpan(value);

        if (ms === null) {
          errors.push(`since takes a span like 30m, 24h or 7d, not "${value}".`);
        } else {
          terms.push({ key: "since", ms, negate });
        }

        break;
      }

      case "duration": {
        const match = value.match(/^([<>])(.+)$/);

        const ms = match ? parseSpan(match[2]) : null;

        if (!match || ms === null) {
          errors.push(`duration takes a bound like >500ms or <2s, not "${value}".`);
        } else {
          terms.push({
            key: "duration",
            comparison: { op: match[1] as ">" | "<", ms },
            negate,
          });
        }

        break;
      }

      default:
        errors.push(`Unknown filter "${key}:".`);
    }
  }

  return { terms, errors };
}

function matchesTerm(
  execution: FilterableExecution,
  term: FilterTerm,
  now: number,
) {
  switch (term.key) {
    case "status":
      return execution.status === term.value;

    case "is":
      return term.value === "replay"
        ? execution.isReplay
        : term.value === "imported"
          ? execution.capsuleId !== null
          : execution.status === "error" && !execution.isReplay;

    case "env":
      return (execution.environment ?? "").toLowerCase() === term.value;

    case "fp":
      return (execution.fingerprintId ?? "")
        .toLowerCase()
        .replace(/^fp_/, "")
        .startsWith(term.value);

    case "endpoint":
      return (execution.rootTitle ?? "").toLowerCase().includes(term.value);

    case "since":
      return now - Date.parse(execution.startedAt) <= term.ms;

    case "duration": {
      const ms = Math.max(
        Date.parse(execution.endedAt) - Date.parse(execution.startedAt),
        0,
      );

      return term.comparison.op === ">"
        ? ms > term.comparison.ms
        : ms < term.comparison.ms;
    }

    case "text":
      return (
        (execution.rootTitle ?? "").toLowerCase().includes(term.value) ||
        execution.id.toLowerCase().startsWith(term.value)
      );
  }
}

export function matchesExecutionFilter(
  execution: FilterableExecution,
  filter: ParsedFilter,
  now = Date.now(),
) {
  return filter.terms.every(
    (term) => matchesTerm(execution, term, now) !== term.negate,
  );
}
