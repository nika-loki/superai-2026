import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: "onboarding" | "active" | "paused" | "churned";
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-notion-green/10 text-notion-green border-notion-green/20",
  onboarding: "bg-notion-blue/10 text-notion-blue border-notion-blue/20",
  new: "bg-notion-blue/10 text-notion-blue border-notion-blue/20",
  paused: "bg-notion-text-muted/10 text-notion-text-muted border-notion-text-muted/20",
  churned: "bg-notion-red/10 text-notion-red border-notion-red/20",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        STATUS_STYLES[status] ?? STATUS_STYLES.paused,
      )}
    >
      {status === "active" && (
        <span className="w-1.5 h-1.5 rounded-full bg-notion-green" />
      )}
      {status === "onboarding" ? "New" : status}
    </span>
  );
}

// ── Run status badge ────────────────────────────────────────────────

interface RunStatusBadgeProps {
  status: "pending" | "running" | "completed" | "failed";
}

const RUN_STYLES: Record<string, string> = {
  completed: "bg-notion-green/10 text-notion-green border-notion-green/20",
  running: "bg-notion-blue/10 text-notion-blue border-notion-blue/20",
  failed: "bg-notion-red/10 text-notion-red border-notion-red/20",
  pending: "bg-notion-text-muted/10 text-notion-text-muted border-notion-text-muted/20",
};

export function RunStatusBadge({ status }: RunStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        RUN_STYLES[status] ?? RUN_STYLES.pending,
      )}
    >
      {status === "running" && (
        <span className="w-1.5 h-1.5 rounded-full bg-notion-blue live-dot" />
      )}
      {status}
    </span>
  );
}

// ── Task status indicator ───────────────────────────────────────────

interface TaskStatusIndicatorProps {
  status: "pending" | "in_progress" | "completed" | "skipped" | "failed";
}

export function TaskStatusIndicator({ status }: TaskStatusIndicatorProps) {
  switch (status) {
    case "completed":
      return (
        <span className="flex w-5 h-5 items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" fill="#27ae60" fillOpacity="0.15" stroke="#27ae60" strokeWidth="1.5" />
            <path d="M5 8l2 2 4-4" stroke="#27ae60" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      );
    case "in_progress":
      return (
        <span className="flex w-5 h-5 items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="animate-spin" style={{ animationDuration: "2s" }}>
            <circle cx="8" cy="8" r="6" stroke="#2383e2" strokeWidth="1.5" strokeDasharray="28 12" strokeLinecap="round" />
          </svg>
        </span>
      );
    case "failed":
      return (
        <span className="flex w-5 h-5 items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" fill="#eb5757" fillOpacity="0.15" stroke="#eb5757" strokeWidth="1.5" />
            <path d="M6 6l4 4M10 6l-4 4" stroke="#eb5757" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      );
    case "skipped":
      return (
        <span className="flex w-5 h-5 items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="#9b9a97" strokeWidth="1.5" strokeDasharray="4 3" />
            <path d="M6 8h4" stroke="#9b9a97" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      );
    default:
      return (
        <span className="flex w-5 h-5 items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="#9b9a97" strokeWidth="1.5" />
          </svg>
        </span>
      );
  }
}
