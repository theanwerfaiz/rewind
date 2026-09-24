import Link from "next/link";

/**
 * Small layout primitives shared by every page, so surfaces, spacing and
 * buttons look the same everywhere.
 */

export function Panel({
  title,
  description,
  actions,
  children,
  className = "",
  flush = false,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** No inner padding: for lists and tables that run edge to edge. */
  flush?: boolean;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-line bg-panel ${className}`}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-medium text-ink">{title}</h2>
            )}

            {description && (
              <p className="mt-0.5 text-sm text-muted">{description}</p>
            )}
          </div>

          {actions && (
            <div className="flex items-center gap-2 text-sm">{actions}</div>
          )}
        </div>
      )}

      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

const BUTTON_STYLES = {
  primary:
    "border-accent bg-accent text-accent-ink font-medium hover:brightness-110",
  secondary: "border-line bg-raised text-ink hover:border-line-strong hover:bg-hover",
  ghost: "border-transparent text-ink-2 hover:bg-raised hover:text-ink",
  danger:
    "border-failure/40 bg-failure-soft text-failure hover:border-failure/70",
};

export type ButtonVariant = keyof typeof BUTTON_STYLES;

export function buttonClass(variant: ButtonVariant = "secondary") {
  return `inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_STYLES[variant]}`;
}

export function ButtonLink({
  href,
  variant = "secondary",
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant)}>
      {children}
    </Link>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong bg-panel/60 px-6 py-14 text-center">
      {icon && <div className="text-faint">{icon}</div>}

      <h2 className="text-base font-medium text-ink">{title}</h2>

      {children && (
        <div className="max-w-md text-sm leading-6 text-muted">{children}</div>
      )}

      {action}
    </div>
  );
}

/** A label/value pair for detail panels. */
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wider text-faint">
        {label}
      </dt>

      <dd className="min-w-0 break-words text-sm text-ink">{children}</dd>
    </div>
  );
}

/** A figure with a label: for the few numbers a page is actually about. */
export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "failure" | "success";
}) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wider text-faint">
        {label}
      </div>

      <div
        className={`mt-1 truncate font-mono text-lg tabular-nums ${
          tone === "failure"
            ? "text-failure"
            : tone === "success"
              ? "text-success"
              : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/** Pretty-printed JSON in a scrollable block. */
export function JsonBlock({
  value,
  maxHeight = "max-h-96",
}: {
  value: unknown;
  maxHeight?: string;
}) {
  return (
    // Focusable so keyboard users can scroll a long block.
    <pre
      tabIndex={0}
      className={`${maxHeight} overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-xs leading-5 text-ink-2`}
    >
      {value === undefined ? "—" : JSON.stringify(value, null, 2)}
    </pre>
  );
}
