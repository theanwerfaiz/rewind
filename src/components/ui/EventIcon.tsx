import {
  Bot,
  Cable,
  Circle,
  CircleAlert,
  Database,
  Globe,
  Rocket,
  SlidersHorizontal,
  Terminal,
  Webhook,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "http.request": Globe,
  "http.dependency": Cable,
  "webhook.received": Webhook,
  error: CircleAlert,
  "database.query": Database,
  "agent.action": Bot,
  command: Terminal,
  deployment: Rocket,
  "config.change": SlidersHorizontal,
};

/**
 * The icon for an event type, in a small tile. Failed events are tinted.
 */
export function EventIcon({
  type,
  status,
  size = "md",
}: {
  type: string;
  status?: string;
  size?: "sm" | "md";
}) {
  const Icon = ICONS[type] ?? Circle;

  const failed = status === "error";

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-md border ${
        size === "sm" ? "h-6 w-6" : "h-8 w-8"
      } ${
        failed
          ? "border-failure/30 bg-failure-soft text-failure"
          : "border-line bg-raised text-ink-2"
      }`}
    >
      <Icon size={size === "sm" ? 13 : 15} strokeWidth={1.8} />
    </span>
  );
}
