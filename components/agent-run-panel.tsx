"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAshAgent } from "experimental-ash/react";
import type { AshAgentReducerEvent, UseAshAgentSnapshot } from "experimental-ash/react";
import { Play, Square, CheckCircle2, XCircle, ChevronDown, ChevronRight, Wrench, X, Clock, Eye, Brain } from "lucide-react";
import { Grid } from "ldrs/react";
import "ldrs/react/Grid.css";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────

type ToolStatus = "running" | "completed" | "failed";

interface ToolActivity {
  readonly callId: string;
  readonly toolName: string;
  readonly status: ToolStatus;
  readonly input?: string;
  readonly output?: string;
  readonly startedAt: number;
  readonly completedAt?: number;
}

interface AgentRunState {
  readonly tools: readonly ToolActivity[];
  readonly summaryText: string;
  readonly chainOfThought: string;
}

// Inline SessionState — experimental-ash/client uses node:module, can't import in "use client"
interface SessionState {
  readonly continuationToken?: string;
  readonly sessionId?: string;
  readonly streamIndex: number;
}

interface AgentRunPanelProps {
  orgName: string;
  orgId: string;
  onRunComplete?: () => void;
  autoStart?: boolean;
  hasActiveRun?: boolean;
}

// ── Session persistence helpers ─────────────────────────────────────

const SESSION_KEY = (orgId: string) => `revenueos_session_${orgId}`;

function saveSessionState(orgId: string, state: SessionState) {
  try {
    localStorage.setItem(SESSION_KEY(orgId), JSON.stringify({
      sessionId: state.sessionId,
      continuationToken: state.continuationToken,
      streamIndex: state.streamIndex,
    }));
  } catch {
    // localStorage not available
  }
}

function loadSessionState(orgId: string): SessionState | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY(orgId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.sessionId) return null;
    return {
      sessionId: parsed.sessionId,
      continuationToken: parsed.continuationToken,
      streamIndex: parsed.streamIndex ?? 0,
    };
  } catch {
    return null;
  }
}

function clearSessionState(orgId: string) {
  try {
    localStorage.removeItem(SESSION_KEY(orgId));
  } catch {
    // ignore
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

function truncate(text: string | undefined, maxLen: number): string {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

function toolLabel(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Custom reducer to track tool calls + chain of thought ─────────────

const INITIAL_STATE: AgentRunState = {
  tools: [],
  summaryText: "",
  chainOfThought: "",
};

function reduceState(data: AgentRunState, event: AshAgentReducerEvent): AgentRunState {
  const type = (event as { type: string }).type;

  // Track tool calls starting
  if (type === "actions.requested") {
    const eventData = event as { data: { actions?: Array<Record<string, unknown>> } };
    const actions = eventData.data.actions ?? [];
    const started: ToolActivity[] = actions
      .filter((a) => a.kind === "tool-call")
      .map((a) => ({
        callId: a.callId as string,
        toolName: a.toolName as string,
        status: "running" as ToolStatus,
        input: typeof a.input === "string" ? truncate(a.input, 500) : undefined,
        startedAt: Date.now(),
      }));
    if (started.length === 0) return data;
    return { ...data, tools: [...data.tools, ...started] };
  }

  // Track tool results
  if (type === "action.result") {
    const eventData = event as { data: { result?: { kind?: string; callId?: string; output?: unknown }; status?: string } };
    if (eventData.data.result?.kind === "tool-result") {
      const callId = eventData.data.result.callId as string;
      const status = (eventData.data.status === "error" ? "failed" : "completed") as ToolStatus;
      const output = typeof eventData.data.result.output === "string"
        ? truncate(eventData.data.result.output, 500)
        : undefined;
      return {
        ...data,
        tools: data.tools.map((t) =>
          t.callId === callId ? { ...t, status, output, completedAt: Date.now() } : t,
        ),
      };
    }
  }

  // Accumulate summary text from assistant messages
  if (type === "message.appended" || type === "message.completed") {
    const eventData = event as { data: { delta?: string; text?: string } };
    const text = eventData.data.delta ?? eventData.data.text ?? "";
    if (text && text.length > 0) {
      return { ...data, summaryText: data.summaryText + text };
    }
  }

  // Capture chain-of-thought reasoning
  if (type === "reasoning.appended") {
    const eventData = event as { data: { reasoningSoFar?: string } };
    const reasoningSoFar = eventData.data.reasoningSoFar ?? "";
    if (reasoningSoFar) {
      return { ...data, chainOfThought: reasoningSoFar };
    }
  }

  if (type === "reasoning.completed") {
    const eventData = event as { data: { reasoning?: string } };
    const reasoning = eventData.data.reasoning ?? "";
    if (reasoning) {
      return { ...data, chainOfThought: reasoning };
    }
  }

  return data;
}

// ── Tool Card ──────────────────────────────────────────────────────────

function ToolCard({ tool }: { tool: ToolActivity }) {
  const [expanded, setExpanded] = React.useState(false);
  const duration = tool.completedAt
    ? formatDuration(tool.completedAt - tool.startedAt)
    : "...";

  return (
    <div
      className={cn(
        "flex items-start gap-3 py-2.5 px-3 transition-colors",
        tool.status === "running" && "bg-notion-blue/5",
      )}
    >
      {/* Status icon */}
      <span className="mt-0.5 shrink-0">
        {tool.status === "running" && (
          <span className="flex h-4 w-4 items-center justify-center">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-notion-blue opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-notion-blue" />
            </span>
          </span>
        )}
        {tool.status === "completed" && <CheckCircle2 size={16} className="text-emerald-500" />}
        {tool.status === "failed" && <XCircle size={16} className="text-red-500" />}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-notion-text">
            {toolLabel(tool.toolName)}
          </span>
          <span className="text-xs text-notion-text-muted">{duration}</span>
        </div>

        {/* Collapsible I/O preview */}
        {(tool.input || tool.output) && (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-0.5 text-xs text-notion-text-muted hover:text-notion-text transition-colors"
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {expanded ? "Hide details" : "Show details"}
            </button>
            {expanded && (
              <div className="mt-1.5 space-y-1.5">
                {tool.input && (
                  <div className="rounded bg-notion-bg-secondary border border-notion-border p-2">
                    <span className="text-[10px] uppercase tracking-wider text-notion-text-muted font-medium">Input</span>
                    <pre className="text-xs text-notion-text mt-1 whitespace-pre-wrap break-all font-mono leading-relaxed max-h-[200px] overflow-y-auto">
                      {truncate(tool.input, 600)}
                    </pre>
                  </div>
                )}
                {tool.output && (
                  <div className="rounded bg-notion-bg-secondary border border-notion-border p-2">
                    <span className="text-[10px] uppercase tracking-wider text-notion-text-muted font-medium">Output</span>
                    <pre className="text-xs text-notion-text mt-1 whitespace-pre-wrap break-all font-mono leading-relaxed max-h-[200px] overflow-y-auto">
                      {truncate(tool.output, 600)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Panel ─────────────────────────────────────────────────────────

export function AgentRunPanel({
  orgName,
  orgId,
  onRunComplete,
  autoStart = false,
  hasActiveRun: externalHasActiveRun = false,
}: AgentRunPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoStarted = useRef(false);
  const [isResuming, setIsResuming] = useState(false);
  const [localHasActiveRun, setLocalHasActiveRun] = useState(externalHasActiveRun);

  // Check for persisted session on mount
  const persistedSession = useMemo(() => loadSessionState(orgId), [orgId]);
  const hasPersistedSession = !!persistedSession?.sessionId;

  const agent = useAshAgent<AgentRunState>({
    // Resume from persisted session if available
    ...(persistedSession ? { initialSession: persistedSession } : {}),
    reducer: {
      initial: () => INITIAL_STATE,
      reduce: reduceState,
    },
    prepareSend(input) {
      return {
        ...input,
        clientContext: {
          orgId,
          orgName,
          pathname: `/org/${orgId}`,
        },
      };
    },
    onSessionChange(session: SessionState) {
      // Persist session state for resume on refresh
      if (session.sessionId) {
        saveSessionState(orgId, session);
      }
    },
    onFinish(_snapshot: UseAshAgentSnapshot<AgentRunState>) {
      // Clear persisted session when run finishes
      clearSessionState(orgId);
      setLocalHasActiveRun(false);
      onRunComplete?.();
    },
  });

  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const hasTools = agent.data.tools.length > 0;
  const completedTools = useMemo(
    () => agent.data.tools.filter((t) => t.status !== "running").length,
    [agent.data.tools],
  );
  const hasSummary = agent.data.summaryText.trim().length > 0;
  const hasChainOfThought = agent.data.chainOfThought.trim().length > 0;
  const canStart = !isBusy && !localHasActiveRun;

  // Detect if we're resuming a session
  useEffect(() => {
    if (hasPersistedSession && agent.status === "streaming") {
      setIsResuming(true);
    } else if (agent.status === "ready" || agent.status === "error") {
      setIsResuming(false);
    }
  }, [agent.status, hasPersistedSession]);

  const handleStart = useCallback(() => {
    setLocalHasActiveRun(true);
    void agent.sendMessage(
      `Research ${orgName} thoroughly. Find buying signals, key contacts, and recommend next-best-actions. Use all available tools.`,
    );
  }, [agent, orgName]);

  const handleStop = useCallback(() => {
    agent.stop();
    setLocalHasActiveRun(false);
    clearSessionState(orgId);
  }, [agent, orgId]);

  // Auto-scroll to bottom when new tools arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [agent.data.tools.length]);

  // Auto-start the agent run when triggered from the header button
  useEffect(() => {
    if (autoStart && !autoStarted.current && agent.status === "ready" && !localHasActiveRun) {
      autoStarted.current = true;
      setLocalHasActiveRun(true);
      void agent.sendMessage(
        `Research ${orgName} thoroughly. Find buying signals, key contacts, and recommend next-best-actions. Use all available tools.`,
      );
    }
  }, [autoStart, agent, orgName, localHasActiveRun]);

  return (
    <div className="border border-notion-border rounded-md overflow-hidden">
      {/* ── Status bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-notion-border bg-notion-bg-secondary">
        <div className="flex items-center gap-2.5">
          {isBusy && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-notion-blue opacity-75 live-dot" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-notion-blue" />
            </span>
          )}
          {!isBusy && hasTools && (
            <CheckCircle2 size={16} className="text-emerald-500" />
          )}
          {!isBusy && !hasTools && (
            <Wrench size={16} className="text-notion-text-muted" />
          )}
          <span className="text-sm font-medium text-notion-text">
            {isResuming ? "Resuming session..." : isBusy ? "Agent researching..." : hasTools ? "Run complete" : "Agent Run"}
          </span>
          {isBusy && (
            <span className="text-xs text-notion-text-muted">
              {completedTools}/{agent.data.tools.length} tools
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isBusy && (
            <button
              type="button"
              onClick={handleStop}
              className="inline-flex items-center gap-1.5 rounded-md border border-notion-border bg-white px-2.5 py-1 text-xs font-medium text-notion-text hover:bg-notion-bg-hover transition-colors"
            >
              <Square size={10} className="fill-current" />
              Stop
            </button>
          )}
          {!isBusy && canStart && (
            <button
              type="button"
              onClick={handleStart}
              className="inline-flex items-center gap-1.5 rounded-md bg-notion-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-notion-blue-hover transition-colors"
            >
              <Play size={12} className="fill-current" />
              Start Research
            </button>
          )}
          {!isBusy && !canStart && !hasTools && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-notion-border px-3 py-1.5 text-xs font-medium text-notion-text-muted cursor-not-allowed opacity-60">
              <Clock size={12} />
              Run in progress...
            </span>
          )}
        </div>
      </div>

      {/* ── Streaming loader (Grid spinner) ─────────────────────────── */}
      {isBusy && (
        <div className="flex flex-col items-center justify-center py-6 border-b border-notion-border bg-gradient-to-b from-notion-blue/5 to-transparent">
          <Grid
            size="48"
            speed="1.5"
            color="var(--notion-blue, #2383e2)"
          />
          <p className="text-sm text-notion-text-muted mt-3">
            {hasTools
              ? `Processing ${agent.data.tools.filter((t) => t.status === "running").length} tool${agent.data.tools.filter((t) => t.status === "running").length !== 1 ? "s" : ""}...`
              : "Agent is thinking..."}
          </p>
        </div>
      )}

      {/* ── Tool timeline ──────────────────────────────────────────── */}
      {hasTools && (
        <div
          ref={scrollRef}
          className="max-h-[400px] overflow-y-auto divide-y divide-notion-border"
        >
          {agent.data.tools.map((tool) => (
            <ToolCard key={tool.callId} tool={tool} />
          ))}
        </div>
      )}

      {/* ── Chain of Thought ──────────────────────────────────────── */}
      {hasChainOfThought && (
        <div className="border-t border-notion-border px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Brain size={12} className="text-purple-500" />
            <span className="text-[10px] uppercase tracking-wider text-notion-text-muted font-medium">
              Chain of Thought
            </span>
            {isBusy && (
              <span className="relative flex h-2 w-2 ml-1">
                <span className="absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-purple-400" />
              </span>
            )}
          </div>
          <div className="bg-purple-50/50 border border-purple-200/50 rounded-md p-3 max-h-[200px] overflow-y-auto">
            <p className="text-xs text-notion-text leading-relaxed whitespace-pre-wrap font-mono">
              {agent.data.chainOfThought}
            </p>
          </div>
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────── */}
      {!hasTools && !isBusy && !hasPersistedSession && (
        <div className="py-10 text-center">
          <p className="text-sm text-notion-text-muted">
            Click &ldquo;Start Research&rdquo; to launch an agent run.
          </p>
          <p className="text-xs text-notion-text-muted mt-1">
            The agent will search for signals, discover contacts, and recommend actions.
          </p>
        </div>
      )}

      {/* ── Summary ────────────────────────────────────────────────── */}
      {!isBusy && hasSummary && (
        <div className="border-t border-notion-border px-4 py-3 bg-notion-bg-secondary">
          <span className="text-[10px] uppercase tracking-wider text-notion-text-muted font-medium">
            Summary
          </span>
          <p className="text-sm text-notion-text mt-1 leading-relaxed whitespace-pre-wrap">
            {agent.data.summaryText}
          </p>
        </div>
      )}

      {/* ── Error state ────────────────────────────────────────────── */}
      {agent.status === "error" && agent.error && (
        <div className="border-t border-red-200 px-4 py-3 bg-red-50">
          <p className="text-sm text-red-600">
            {agent.error.message || "An error occurred during the agent run."}
          </p>
        </div>
      )}
    </div>
  );
}
