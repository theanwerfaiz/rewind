import { ChevronLeft, ChevronRight } from "lucide-react";

type RewindLogoProps = {
  size?: number;
  showText?: boolean;
};

export function RewindLogo({ size = 32, showText = true }: RewindLogoProps) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="flex items-center justify-center rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500 shadow-lg shadow-blue-500/20"
        style={{
          width: size,
          height: size,
        }}
      >
        <div className="flex items-center -space-x-1.5 text-white">
          <ChevronLeft size={size * 0.55} strokeWidth={3} />
          <ChevronLeft size={size * 0.55} strokeWidth={3} />
        </div>
      </div>

      {showText && (
        <span className="text-xl font-semibold tracking-tight text-white">
          Rewind
        </span>
      )}
    </div>
  );
}
