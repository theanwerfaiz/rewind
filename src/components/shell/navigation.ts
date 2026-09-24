import {
  Activity,
  AlertTriangle,
  GitBranch,
  LayoutDashboard,
  List,
  Package,
  Play,
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
];

export function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
