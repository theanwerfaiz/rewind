/**
 * Scans JSON values for secrets and personal data before they leave
 * Rewind (e.g. in an exported capsule). Header and field redaction happens
 * at capture time; this is the last line of defence for secrets that slip
 * through inside free-form values.
 */

export type ScanSeverity = "secret" | "pii";

export type ScanFinding = {
  /** JSON path of the value, e.g. "events[2].metadata.response.body.key". */
  path: string;
  rule: string;
  severity: ScanSeverity;
  /** The match with most characters masked. */
  preview: string;
};

type Rule = {
  name: string;
  severity: ScanSeverity;
  pattern: RegExp;
  verify?: (match: string) => boolean;
};

/**
 * A plausible payment card: a known issuer prefix (Visa, Mastercard, Amex,
 * Discover) and a valid Luhn checksum. The prefix check keeps IDs that
 * embed millisecond timestamps from being reported as cards.
 */
function isCardNumber(value: string) {
  const digits = value.replace(/\D/g, "");

  if (
    digits.length < 13 ||
    digits.length > 19 ||
    /^(\d)\1+$/.test(digits) ||
    !/^(?:4|5[1-5]|2[2-7]|3[47]|6011|65)/.test(digits)
  ) {
    return false;
  }

  let sum = 0;

  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);

    if (index % 2 === 1) {
      digit *= 2;

      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
  }

  return sum % 10 === 0;
}

const RULES: Rule[] = [
  {
    name: "private key",
    severity: "secret",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    name: "AWS access key",
    severity: "secret",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    name: "Stripe secret key",
    severity: "secret",
    pattern: /\b(?:sk|rk)_live_[0-9A-Za-z]{10,}\b/g,
  },
  {
    name: "GitHub token",
    severity: "secret",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/g,
  },
  {
    name: "Slack token",
    severity: "secret",
    pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    name: "Google API key",
    severity: "secret",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    name: "AI provider API key",
    severity: "secret",
    pattern: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}\b/g,
  },
  {
    name: "JSON Web Token",
    severity: "secret",
    pattern:
      /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    name: "bearer token",
    severity: "secret",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g,
  },
  {
    name: "payment card number",
    severity: "secret",
    pattern: /\b(?:\d[ -]?){12,18}\d\b/g,
    verify: isCardNumber,
  },
  {
    name: "email address",
    severity: "pii",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
];

const MAX_FINDINGS = 200;

function mask(value: string) {
  if (value.length <= 8) {
    return "*".repeat(value.length);
  }

  return `${value.slice(0, 4)}${"*".repeat(Math.min(value.length - 6, 24))}${value.slice(-2)}`;
}

function childPath(parent: string, key: string | number) {
  if (typeof key === "number") {
    return `${parent}[${key}]`;
  }

  return parent ? `${parent}.${key}` : key;
}

function scanString(value: string, path: string, findings: ScanFinding[]) {
  for (const rule of RULES) {
    for (const match of value.matchAll(rule.pattern)) {
      if (findings.length >= MAX_FINDINGS) {
        return;
      }

      if (rule.verify && !rule.verify(match[0])) {
        continue;
      }

      findings.push({
        path,
        rule: rule.name,
        severity: rule.severity,
        preview: mask(match[0]),
      });
    }
  }
}

/**
 * Returns every finding in a JSON value (strings and object keys are
 * scanned; numbers are scanned too, as card numbers are often numeric).
 */
export function scanForSecrets(value: unknown): ScanFinding[] {
  const findings: ScanFinding[] = [];

  function walk(current: unknown, path: string, depth: number) {
    if (findings.length >= MAX_FINDINGS || depth > 64) {
      return;
    }

    if (typeof current === "string") {
      scanString(current, path || "$", findings);
      return;
    }

    if (typeof current === "number" && Number.isInteger(current)) {
      scanString(String(current), path || "$", findings);
      return;
    }

    if (Array.isArray(current)) {
      current.forEach((item, index) =>
        walk(item, childPath(path, index), depth + 1),
      );
      return;
    }

    if (typeof current === "object" && current !== null) {
      for (const [key, item] of Object.entries(current)) {
        const itemPath = childPath(path, key);

        scanString(key, itemPath, findings);
        walk(item, itemPath, depth + 1);
      }
    }
  }

  walk(value, "", 0);

  return findings;
}

export function hasBlockingFindings(findings: ScanFinding[]) {
  return findings.some((finding) => finding.severity === "secret");
}
