"use client";

import { useEffect, useRef, useState } from "react";
import { X, Clock, Wrench, CheckCircle2, XCircle, ChevronDown, ChevronRight, Brain } from "lucide-react";
import type { AgentRun, TraceToolCall } from "@/lib/data";
import { RunStatusBadge } from "@/components/status-badge";
import { ScoreBadge } from "@/components/score-badge";
import { cn } from "@/lib/utils";

interface RunTracePanelProps {
  run: AgentRun | null;
  onClose: () => void;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "--";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatToolDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt) return "--";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toolLabel(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function TraceToolCard({ tool }: { tool: TraceToolCall }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      "flex items-start gap-3 py-2 px-3 rounded-md text-sm",
      tool.status === "running" && "bg-blue-50",
    )}>
      <span className="mt-0.5 shrink-0">
        {tool.status === "completed" && <CheckCircle2 size={14} className="text-emerald-500" />}
        {tool.status === "failed" && <XCircle size={14} className="text-red-500" />}
        {tool.status === "running" && (
          <span className="relative flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-blue-400" />
          </span>
        )}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-notion-text">{toolLabel(tool.toolName)}</span>
          <span className="text-xs text-notion-text-muted">
            {formatToolDuration(tool.startedAt, tool.completedAt)}
          </span>
        </div>
        {(tool.input || tool.output) && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-0.5 text-xs text-notion-text-muted hover:text-notion-text mt-0.5"
          >
            {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            {expanded ? "Hide" : "Details"}
          </button>
        )}
        {expanded && (
          <div className="mt-1.5 space-y-1.5">
            {tool.input && (
              <div>
                <span className="text-[10px] uppercase tracking-wider text-notion-text-muted font-medium">Input</span>
                <pre className="mt-1 text-xs bg-notion-bg-secondary border border-notion-border rounded p-2 whitespace-pre-wrap break-all font-mono max-h-[200px] overflow-y-auto">
                  {tool.input}
                </pre>
              </div>
            )}
            {tool.output && (
              <div>
                <span className="text-[10px] uppercase tracking-wider text-notion-text-muted font-medium">Output</span>
                <pre className="mt-1 text-xs bg-notion-bg-secondary border border-notion-border rounded p-2 whitespace-pre-wrap break-all font-mono max-h-[200px] overflow-y-auto">
                  {tool.output}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function RunTracePanel({ run, onClose }: RunTracePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // Animate in
  useEffect(() => {
    if (run) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [run]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (run) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [run, onClose]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!run) return null;

  // Use real trace data from DB (populated by capture-trace hook)
  const traceTools = run.traceData ?? [];

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 transition-all duration-300",
        visible ? "bg-black/20" : "bg-transparent",
      )}
      onClick={handleBackdropClick}
    >
      <div
        ref={panelRef}
        className={cn(
          "absolute right-0 top-0 bottom-0 w-[560px] max-w-full bg-white border-l border-notion-border shadow-2xl transition-transform duration-300 ease-out flex flex-col",
          visible ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-notion-border shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-notion-text">Run Trace</h2>
            <RunStatusBadge status={run.status} />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-notion-text-muted hover:text-notion-text hover:bg-notion-bg-hover transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Scrollable content ──────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {/* Run metadata */}
          <div className="px-5 py-4 border-b border-notion-border space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-notion-text-muted font-medium">Started</span>
                <p className="text-sm text-notion-text mt-0.5">{formatDate(run.startedAt)}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-notion-text-muted font-medium">Duration</span>
                <p className="text-sm text-notion-text mt-0.5 flex items-center gap-1">
                  <Clock size={12} />
                  {formatDuration(run.durationMs ?? null)}
                </p>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-notion-text-muted font-medium">Tools Invoked</span>
                <p className="text-sm text-notion-text mt-0.5 flex items-center gap-1">
                  <Wrench size={12} />
                  {run.toolsInvoked}
                </p>
              </div>
              {run.icpFitScore !== null && run.icpFitScore !== undefined && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-notion-text-muted font-medium">ICP Fit Score</span>
                  <div className="mt-0.5">
                    <ScoreBadge score={run.icpFitScore} size="sm" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Chain of Thought */}
          {run.chainOfThought && (
            <div className="px-5 py-4 border-b border-notion-border">
              <div className="flex items-center gap-1.5 mb-2">
                <Brain size={12} className="text-purple-500" />
                <span className="text-[10px] uppercase tracking-wider text-notion-text-muted font-medium">
                  Chain of Thought
                </span>
              </div>
              <div className="bg-purple-50/50 border border-purple-200/50 rounded-md p-3">
                <p className="text-sm text-notion-text leading-relaxed whitespace-pre-wrap font-mono text-xs">
                  {run.chainOfThought}
                </p>
              </div>
            </div>
          )}

          {/* Summary */}
          {run.summary && (
            <div className="px-5 py-4 border-b border-notion-border">
              <span className="text-[10px] uppercase tracking-wider text-notion-text-muted font-medium">Summary</span>
              <p className="text-sm text-notion-text mt-1.5 leading-relaxed whitespace-pre-wrap">
                {run.summary}
              </p>
            </div>
          )}

          {/* Tool trace timeline */}
          <div className="px-5 py-4">
            <span className="text-[10px] uppercase tracking-wider text-notion-text-muted font-medium">
              Tool Calls ({traceTools.length})
            </span>
            <div className="mt-3 space-y-1">
              {traceTools.map((tool: TraceToolCall, i: number) => (
                <TraceToolCard key={`${tool.callId}-${i}`} tool={tool} />
              ))}
            </div>
            {traceTools.length === 0 && (
              <p className="text-sm text-notion-text-muted mt-3">
                {run.status === "running"
                  ? "Tools will appear here as the agent runs..."
                  : "No tool call details captured for this run."}
              </p>
            )}
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div className="px-5 py-3 border-t border-notion-border bg-notion-bg-secondary shrink-0">
          <p className="text-xs text-notion-text-muted">
            Completed {formatDate(run.completedAt)}
          </p>
        </div>
      </div>
    </div>
  );
}
