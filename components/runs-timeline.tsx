"use client";

import { useState } from "react";
import { Clock, Wrench, Eye } from "lucide-react";
import type { AgentRun } from "@/lib/data";
import { RunStatusBadge } from "@/components/status-badge";
import { ScoreBadge as IcpBadge } from "@/components/score-badge";
import { RunTracePanel } from "@/components/run-trace-panel";

interface RunsTimelineProps {
  runs: AgentRun[];
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RunCard({ run, index, onViewTrace }: { run: AgentRun; index: number; onViewTrace: () => void }) {
  return (
    <div
      className="border border-notion-border rounded-md p-4 hover:bg-notion-bg-hover transition-colors group cursor-pointer"
      onClick={onViewTrace}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-notion-text">
            Run #{index + 1}
          </span>
          <RunStatusBadge status={run.status} />
        </div>
        <div className="flex items-center gap-3">
          {run.durationMs !== null && (
            <span className="inline-flex items-center gap-1 text-xs text-notion-text-muted">
              <Clock size={12} />
              {formatDuration(run.durationMs)}
            </span>
          )}
          {run.startedAt && (
            <span className="text-xs text-notion-text-muted">
              {formatDate(run.startedAt)}
            </span>
          )}
          {/* View trace button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewTrace();
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-notion-text-muted hover:text-notion-blue hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all"
          >
            <Eye size={12} />
            View Trace
          </button>
        </div>
      </div>

      {/* Summary */}
      {run.summary && (
        <p className="text-sm text-notion-text mt-3 leading-relaxed line-clamp-3">
          {run.summary}
        </p>
      )}

      {/* Footer metadata */}
      <div className="flex items-center gap-4 mt-3">
        <span className="inline-flex items-center gap-1 text-xs text-notion-text-muted">
          <Wrench size={12} />
          {run.toolsInvoked} tools invoked
        </span>
        {run.icpFitScore !== null && (
          <span className="inline-flex items-center gap-1.5 text-xs text-notion-text-muted">
            ICP Fit
            <IcpBadge score={run.icpFitScore} size="sm" />
          </span>
        )}
      </div>
    </div>
  );
}

export function RunsTimeline({ runs }: RunsTimelineProps) {
  const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null);

  if (runs.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-notion-text-muted">
          No agent runs recorded yet.
        </p>
        <p className="text-xs text-notion-text-muted mt-1">
          Run the agent to start researching this organisation.
        </p>
      </div>
    );
  }

  const sorted = [...runs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <>
      <div className="space-y-3">
        {sorted.map((run, i) => (
          <RunCard
            key={run.id}
            run={run}
            index={sorted.length - 1 - i}
            onViewTrace={() => setSelectedRun(run)}
          />
        ))}
      </div>

      {/* Slide-in trace panel */}
      <RunTracePanel
        run={selectedRun}
        onClose={() => setSelectedRun(null)}
      />
    </>
  );
}
