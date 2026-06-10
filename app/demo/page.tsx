"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { CSSProperties } from "react";

/* ================================================================
   Types
   ================================================================ */

interface DemoData {
  org: {
    name: string;
    domain: string;
    hqCountry: string;
    icpScore: number;
  };
  toolCalls: Array<{
    tool: string;
    status: string;
    duration: number;
    summary: string;
  }>;
  signals: Array<{
    type: string;
    title: string;
    impact: string;
    icpRelevance: number;
  }>;
  contacts: Array<{
    name: string;
    title: string;
    seniority: string;
    relevance: string;
  }>;
  summary: string;
}

type ToolPhase = "waiting" | "running" | "completed";

interface ToolState {
  phase: ToolPhase;
  summary: string | null;
}

/* ================================================================
   Animation helpers
   ================================================================ */

function clampDuration(ms: number): number {
  return Math.max(1500, Math.min(5000, ms));
}

const SIGNAL_ICONS: Record<string, string> = {
  funding: "$",
  expansion: "→",
  leadership: "♦",
  product: "●",
  partnership: "↔",
  regulatory: "§",
};

const SIGNAL_COLORS: Record<string, string> = {
  funding: "text-notion-green",
  expansion: "text-notion-orange",
  leadership: "text-notion-blue",
  product: "text-notion-purple",
  partnership: "text-notion-text-muted",
  regulatory: "text-notion-red",
};

const SENIORITY_LABELS: Record<string, string> = {
  "c-suite": "C-Suite",
  vp: "VP",
  director: "Director",
};

/* ================================================================
   Spinner SVG
   ================================================================ */

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      style={{ animationDuration: "1.5s" } as CSSProperties}
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="#2383e2"
        strokeWidth="1.5"
        strokeDasharray="28 12"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ================================================================
   Check SVG
   ================================================================ */

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle
        cx="8"
        cy="8"
        r="7"
        fill="#27ae60"
        fillOpacity="0.15"
        stroke="#27ae60"
        strokeWidth="1.5"
      />
      <path
        d="M5 8l2 2 4-4"
        stroke="#27ae60"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ================================================================
   Fade-in wrapper
   ================================================================ */

function FadeIn({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        transition: "opacity 0.5s ease, transform 0.5s ease",
      }}
    >
      {children}
    </div>
  );
}

/* ================================================================
   Main Page
   ================================================================ */

export default function DemoPage() {
  const [data, setData] = useState<DemoData | null>(null);
  const [toolStates, setToolStates] = useState<ToolState[]>([]);
  const [currentTool, setCurrentTool] = useState(-1);
  const [visibleSignals, setVisibleSignals] = useState(0);
  const [visibleContacts, setVisibleContacts] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [started, setStarted] = useState(false);
  const [score, setScore] = useState(82);
  const replayRef = useRef(0);

  /* ----------------------------------------------------------
     Load JSON
     ---------------------------------------------------------- */

  useEffect(() => {
    fetch("/demo-run.json")
      .then((r) => r.json())
      .then((d: DemoData) => {
        setData(d);
        setToolStates(d.toolCalls.map(() => ({ phase: "waiting", summary: null })));
      })
      .catch(() => {
        // silent — page shows loading state
      });
  }, []);

  /* ----------------------------------------------------------
     Auto-play sequence
     ---------------------------------------------------------- */

  const runSequence = useCallback(() => {
    if (!data) return;
    const seqId = ++replayRef.current;

    // Reset
    setStarted(true);
    setCurrentTool(-1);
    setVisibleSignals(0);
    setVisibleContacts(0);
    setShowSummary(false);
    setScore(82);
    setToolStates(data.toolCalls.map(() => ({ phase: "waiting", summary: null })));

    let offset = 1000; // initial "Starting research..." delay

    data.toolCalls.forEach((tc, i) => {
      // Start tool
      const startAt = offset;
      setTimeout(() => {
        if (replayRef.current !== seqId) return;
        setCurrentTool(i);
        setToolStates((prev) => {
          const next = [...prev];
          next[i] = { phase: "running", summary: null };
          return next;
        });
      }, startAt);

      // Complete tool
      const dur = clampDuration(tc.duration);
      const completeAt = startAt + dur;
      setTimeout(() => {
        if (replayRef.current !== seqId) return;
        setToolStates((prev) => {
          const next = [...prev];
          next[i] = { phase: "completed", summary: tc.summary };
          return next;
        });

        // Show signals after db_write_signals completes
        if (tc.tool === "db_write_signals") {
          data.signals.forEach((_, si) => {
            setTimeout(() => {
              if (replayRef.current !== seqId) return;
              setVisibleSignals(si + 1);
            }, (si + 1) * 300);
          });
        }

        // Show contacts after db_write_contacts completes
        if (tc.tool === "db_write_contacts") {
          data.contacts.forEach((_, ci) => {
            setTimeout(() => {
              if (replayRef.current !== seqId) return;
              setVisibleContacts(ci + 1);
            }, (ci + 1) * 250);
          });
        }

        // Animate score after db_update_org
        if (tc.tool === "db_update_org") {
          setTimeout(() => {
            if (replayRef.current !== seqId) return;
            setScore(87);
          }, 300);
        }
      }, completeAt);

      offset = completeAt + 200; // small gap between tools
    });

    // Show summary after everything
    setTimeout(() => {
      if (replayRef.current !== seqId) return;
      setCurrentTool(-1);
      setShowSummary(true);
    }, offset + 600);
  }, [data]);

  // Auto-start on load
  useEffect(() => {
    if (data && !started) {
      runSequence();
    }
  }, [data, started, runSequence]);

  /* ----------------------------------------------------------
     Replay
     ---------------------------------------------------------- */

  const handleReplay = () => {
    replayRef.current++;
    setStarted(false);
    // Small delay to let state reset render, then re-trigger
    setTimeout(() => runSequence(), 50);
  };

  /* ----------------------------------------------------------
     Render: loading
     ---------------------------------------------------------- */

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-notion-bg">
        <p className="text-notion-text-muted text-sm">Loading demo data...</p>
      </div>
    );
  }

  const isRunning = currentTool >= 0 && toolStates[currentTool]?.phase === "running";

  /* ----------------------------------------------------------
     Render: main layout
     ---------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-notion-bg">
      {/* ---- Header ---- */}
      <header className="border-b border-notion-border bg-white sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-notion-text tracking-tight">
              RevenueOS
            </h1>
            <span className="text-notion-text-muted text-sm">—</span>
            <span className="text-sm text-notion-text-muted">Live Demo</span>

            {isRunning && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-notion-green">
                <span className="w-2 h-2 rounded-full bg-notion-green live-dot" />
                Running
              </span>
            )}
            {!isRunning && showSummary && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-notion-text-muted">
                <span className="w-2 h-2 rounded-full bg-notion-text-muted" />
                Completed
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Score badge */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-notion-text-muted">ICP Score</span>
              <span
                className="inline-flex items-center justify-center w-9 h-9 rounded-full border text-sm font-semibold tabular-nums transition-all duration-700 ease-out"
                style={{
                  borderColor: score >= 80 ? "#27ae60" : score >= 50 ? "#f2994a" : "#eb5757",
                  color: score >= 80 ? "#27ae60" : score >= 50 ? "#f2994a" : "#eb5757",
                  backgroundColor: score >= 80 ? "rgba(39,174,96,0.08)" : score >= 50 ? "rgba(242,153,74,0.08)" : "rgba(235,87,87,0.08)",
                }}
              >
                {score}
              </span>
            </div>

            <button
              onClick={handleReplay}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-notion-border text-notion-text bg-white hover:bg-notion-bg-hover transition-colors cursor-pointer"
            >
              Replay
            </button>
          </div>
        </div>
      </header>

      {/* ---- Org Banner ---- */}
      <div className="border-b border-notion-border bg-notion-bg-secondary">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center gap-3">
          <span className="text-lg">🇸🇬</span>
          <span className="font-semibold text-notion-text text-base">{data.org.name}</span>
          <span className="text-notion-text-muted text-sm">{data.org.domain}</span>
          <span className="text-notion-text-muted text-sm">·</span>
          <span className="text-notion-text-muted text-sm">{data.org.hqCountry}</span>
        </div>
      </div>

      {/* ---- Starting message ---- */}
      {started && (
        <FadeIn delay={200}>
          <div className="max-w-[1400px] mx-auto px-6 pt-4">
            <p className="text-sm text-notion-text-muted italic">
              Starting autonomous research on <span className="font-medium text-notion-text">Grab</span>...
            </p>
          </div>
        </FadeIn>
      )}

      {/* ---- Three-column layout ---- */}
      <div className="max-w-[1400px] mx-auto px-6 py-4 grid grid-cols-[2fr_1.5fr_1fr] gap-5">
        {/* ======== LEFT: Tool Calls ======== */}
        <section>
          <h2 className="text-xs font-medium text-notion-text-muted uppercase tracking-wider mb-3">
            Agent Tool Calls
          </h2>
          <div className="space-y-2">
            {data.toolCalls.map((tc, i) => {
              const state = toolStates[i];
              if (!state || state.phase === "waiting") return null;

              return (
                <FadeIn key={tc.tool} delay={0}>
                  <div className="border border-notion-border rounded-md bg-white p-3 transition-all duration-300">
                    <div className="flex items-center gap-2 mb-1">
                      {state.phase === "running" && <Spinner className="animate-spin" />}
                      {state.phase === "completed" && <Check />}
                      <span className="text-sm font-medium text-notion-text font-mono">
                        {tc.tool}
                      </span>
                      <span className="ml-auto text-[11px] text-notion-text-muted tabular-nums">
                        {(clampDuration(tc.duration) / 1000).toFixed(1)}s
                      </span>
                    </div>
                    {state.summary && (
                      <p className="text-xs text-notion-text-muted leading-relaxed mt-1.5 pl-6">
                        {state.summary}
                      </p>
                    )}
                  </div>
                </FadeIn>
              );
            })}
          </div>
        </section>

        {/* ======== CENTER: Signals ======== */}
        <section>
          <h2 className="text-xs font-medium text-notion-text-muted uppercase tracking-wider mb-3">
            Signals Discovered
          </h2>
          <div className="space-y-2">
            {data.signals.slice(0, visibleSignals).map((sig, i) => (
              <FadeIn key={sig.title} delay={0}>
                <div className="border border-notion-border rounded-md bg-white p-3 flex items-start gap-3 transition-all duration-300">
                  {/* Signal type icon */}
                  <span
                    className={`text-base font-bold mt-0.5 ${SIGNAL_COLORS[sig.type] ?? "text-notion-text-muted"}`}
                  >
                    {SIGNAL_ICONS[sig.type] ?? "•"}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-notion-text leading-snug">
                      {sig.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[11px] text-notion-text-muted capitalize">
                        {sig.type}
                      </span>
                      <span className="text-notion-border">·</span>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                          sig.impact === "high" ? "text-notion-red" : "text-notion-orange"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            sig.impact === "high" ? "bg-notion-red" : "bg-notion-orange"
                          }`}
                        />
                        {sig.impact}
                      </span>
                      <span className="text-notion-border">·</span>
                      <span className="text-[11px] text-notion-text-muted">
                        ICP {sig.icpRelevance}
                      </span>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}

            {visibleSignals === 0 && (
              <p className="text-xs text-notion-text-muted italic py-4 text-center">
                Signals will appear as the agent discovers them...
              </p>
            )}
          </div>
        </section>

        {/* ======== RIGHT: Contacts ======== */}
        <section>
          <h2 className="text-xs font-medium text-notion-text-muted uppercase tracking-wider mb-3">
            Key Contacts
          </h2>
          <div className="space-y-2">
            {data.contacts.slice(0, visibleContacts).map((c) => (
              <FadeIn key={c.name} delay={0}>
                <div className="border border-notion-border rounded-md bg-white p-3 transition-all duration-300">
                  <p className="text-sm font-medium text-notion-text">{c.name}</p>
                  <p className="text-xs text-notion-text-muted mt-0.5">{c.title}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="inline-flex items-center rounded border border-notion-border px-1.5 py-0.5 text-[10px] font-medium text-notion-text-muted">
                      {SENIORITY_LABELS[c.seniority] ?? c.seniority}
                    </span>
                    {c.relevance === "high" && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-notion-green">
                        <span className="w-1.5 h-1.5 rounded-full bg-notion-green" />
                        High fit
                      </span>
                    )}
                  </div>
                </div>
              </FadeIn>
            ))}

            {visibleContacts === 0 && (
              <p className="text-xs text-notion-text-muted italic py-4 text-center">
                Contacts will appear after people search...
              </p>
            )}
          </div>
        </section>
      </div>

      {/* ---- Summary ---- */}
      {showSummary && (
        <FadeIn delay={0}>
          <div className="max-w-[1400px] mx-auto px-6 pb-8">
            <div className="border border-notion-green/30 rounded-md bg-notion-green/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Check />
                <h3 className="text-sm font-semibold text-notion-text">Research Summary</h3>
              </div>
              <p className="text-sm text-notion-text leading-relaxed">
                {data.summary}
              </p>
            </div>
          </div>
        </FadeIn>
      )}
    </div>
  );
}
