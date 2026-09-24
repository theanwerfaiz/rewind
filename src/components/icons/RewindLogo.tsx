import { ChevronLeft } from "lucide-react";

type RewindLogoProps = {
  size?: number;
  showText?: boolean;
};

export function RewindLogo({ size = 28, showText = true }: RewindLogoProps) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="relative flex items-center justify-center rounded-lg border border-line-strong bg-raised text-accent"
        style={{
          width: size,
          height: size,
        }}
      >
        <div className="flex items-center -space-x-1.5">
          <ChevronLeft size={size * 0.55} strokeWidth={2.75} />
          <ChevronLeft size={size * 0.55} strokeWidth={2.75} />
        </div>

        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-sidebar bg-recorder" />
      </div>

      {showText && (
        <span className="text-base font-semibold tracking-tight text-ink">
          Rewind
        </span>
      )}
    </div>
  );
}
