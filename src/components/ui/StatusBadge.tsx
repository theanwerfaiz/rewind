type Tone = "success" | "failure" | "warning" | "accent" | "neutral";

const TONES: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  failure: "bg-failure-soft text-failure",
  warning: "bg-warning-soft text-warning",
  accent: "bg-accent-soft text-accent",
  neutral: "bg-raised text-ink-2",
};

/** A compact label whose color carries meaning. */
export function Badge({
  tone = "neutral",
  children,
  title,
}: {
  tone?: Tone;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-xs leading-4 ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function toneForStatus(status: string | null | undefined): Tone {
  if (status === "error" || status === "fail") {
    return "failure";
  }

  if (status === "success" || status === "pass") {
    return "success";
  }

  return "neutral";
}

export function toneForHttpStatus(status: number | null | undefined): Tone {
  if (status === null || status === undefined) {
    return "neutral";
  }

  if (status >= 500 || status >= 400) {
    return "failure";
  }

  if (status >= 300) {
    return "warning";
  }

  return "success";
}

/** An event or execution status: success, error or neutral. */
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={toneForStatus(status)}>{status}</Badge>;
}

/** An HTTP status code, colored by class. */
export function HttpStatus({ status }: { status: number | null | undefined }) {
  return (
    <Badge tone={toneForHttpStatus(status)}>
      {status === null || status === undefined ? "—" : status}
    </Badge>
  );
}

/** A small dot for dense lists. */
export function StatusDot({ status }: { status: string }) {
  const tone = toneForStatus(status);

  return (
    <span
      aria-label={status}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${
        tone === "failure"
          ? "bg-failure"
          : tone === "success"
            ? "bg-success"
            : "bg-faint"
      }`}
    />
  );
}
