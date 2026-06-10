"use client";

import { useRouter } from "next/navigation";
import { Play, Loader2 } from "lucide-react";

interface RunAgentButtonClientProps {
  orgId: string;
  hasActiveRun?: boolean;
}

export function RunAgentButtonClient({ orgId, hasActiveRun = false }: RunAgentButtonClientProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(`/org/${orgId}?tab=runs&trigger=1`);
  };

  if (hasActiveRun) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-notion-border px-3 py-1.5 text-sm font-medium text-notion-text-muted cursor-not-allowed opacity-60">
        <Loader2 size={14} className="animate-spin" style={{ animationDuration: "1.5s" }} />
        Researching...
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-2 rounded-md border border-notion-border bg-notion-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-notion-blue-hover transition-colors"
    >
      <Play size={14} />
      Run Agent
    </button>
  );
}
