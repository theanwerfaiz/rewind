import { ChevronRight } from "lucide-react";
import Link from "next/link";

export type Crumb = {
  label: string;
  href?: string;
};

/**
 * The header every page starts with: breadcrumbs, title, an optional
 * description and meta line, and the page's actions on the right.
 */
export function PageHeader({
  crumbs = [],
  title,
  description,
  meta,
  actions,
  badges,
}: {
  crumbs?: Crumb[];
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  badges?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 space-y-2">
        {crumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-1 text-sm text-muted"
          >
            {crumbs.map((crumb, index) => (
              <span key={index} className="flex items-center gap-1">
                {index > 0 && (
                  <ChevronRight size={13} className="text-faint" />
                )}

                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="transition hover:text-ink"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-ink-2">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}

        {badges && <div className="flex flex-wrap items-center gap-2">{badges}</div>}

        <h1 className="text-2xl font-semibold tracking-tight text-ink [text-wrap:balance]">
          {title}
        </h1>

        {description && (
          <p className="max-w-2xl text-sm leading-6 text-muted">
            {description}
          </p>
        )}

        {meta && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {meta}
          </div>
        )}
      </div>

      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}
