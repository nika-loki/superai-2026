import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number | null;
  size?: "sm" | "md";
}

export function ScoreBadge({ score, size = "md" }: ScoreBadgeProps) {
  if (score === null) {
    return (
      <span className="text-notion-text-muted text-xs">--</span>
    );
  }

  const color =
    score >= 80
      ? "text-notion-green border-notion-green/30 bg-notion-green/8"
      : score >= 50
        ? "text-notion-orange border-notion-orange/30 bg-notion-orange/8"
        : "text-notion-red border-notion-red/30 bg-notion-red/8";

  const sizeClasses = size === "sm"
    ? "w-7 h-7 text-xs"
    : "w-9 h-9 text-sm";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border font-semibold tabular-nums",
        sizeClasses,
        color,
      )}
    >
      {score}
    </span>
  );
}
