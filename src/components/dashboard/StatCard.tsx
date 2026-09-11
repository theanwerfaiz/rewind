import { Activity, AlertTriangle, Clock3, Webhook } from "lucide-react";

type StatCardProps = {
  label: string;
  value: string;
  description: string;
  type: "events" | "errors" | "webhooks" | "latency";
};

const config = {
  events: {
    icon: Activity,
    iconClass: "text-blue-400 bg-blue-500/10",
  },
  errors: {
    icon: AlertTriangle,
    iconClass: "text-red-400 bg-red-500/10",
  },
  webhooks: {
    icon: Webhook,
    iconClass: "text-purple-400 bg-purple-500/10",
  },
  latency: {
    icon: Clock3,
    iconClass: "text-amber-400 bg-amber-500/10",
  },
};

export function StatCard({ label, value, description, type }: StatCardProps) {
  const { icon: Icon, iconClass } = config[type];

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0d1320] p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-slate-500">{label}</div>

          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
            {value}
          </div>
        </div>

        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconClass}`}
        >
          <Icon size={17} />
        </div>
      </div>

      <div className="mt-3 text-[11px] text-slate-500">{description}</div>
    </div>
  );
}
