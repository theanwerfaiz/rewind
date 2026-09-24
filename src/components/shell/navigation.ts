import {
  Activity,
  AlertTriangle,
  FlaskConical,
  GitCompareArrows,
  GitBranch,
  LayoutDashboard,
  List,
  Package,
  Play,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

/** Pages grouped by the job someone is doing, following the product loop. */
export const NAVIGATION: NavGroup[] = [
  {
    label: "Monitor",
    items: [
      { label: "Overview", href: "/", icon: LayoutDashboard },
      { label: "Executions", href: "/executions", icon: GitBranch },
      { label: "Failures", href: "/fingerprints", icon: AlertTriangle },
    ],
  },
  {
    label: "Debug",
    items: [
      { label: "Replay Lab", href: "/lab", icon: FlaskConical },
      { label: "Compare", href: "/executions/compare", icon: GitCompareArrows },
    ],
  },
  {
    label: "Prevent",
    items: [
      { label: "Capsules", href: "/capsules", icon: Package },
      { label: "Verifications", href: "/verifications", icon: ShieldCheck },
    ],
  },
  {
    label: "Raw data",
    items: [
      { label: "Events", href: "/events", icon: List },
      { label: "Timeline", href: "/timeline", icon: Activity },
      { label: "Replays", href: "/replays", icon: Play },
    ],
  },
  {
    label: "Workspace",
    items: [{ label: "Settings", href: "/settings", icon: Settings }],
  },
];

function matches(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

/** True when `href` is the most specific navigation item for the path. */
export function isActive(pathname: string, href: string) {
  if (!matches(pathname, href)) {
    return false;
  }

  return !NAVIGATION.some((group) =>
    group.items.some(
      (item) =>
        item.href.length > href.length && matches(pathname, item.href),
    ),
  );
}
