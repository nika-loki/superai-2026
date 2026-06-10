"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Star } from "lucide-react";
import type { Signal } from "@/lib/data";
import { cn } from "@/lib/utils";

interface SignalsListProps {
  signals: Signal[];
}

const SIGNAL_COLORS: Record<string, string> = {
  funding_round: "bg-notion-green",
  leadership_change: "bg-notion-blue",
  product_launch: "bg-notion-purple",
  expansion: "bg-notion-orange",
  regulatory: "bg-notion-red",
};

function SignalTypeDot({ type }: { type: string }) {
  const color = SIGNAL_COLORS[type] ?? "bg-notion-text-muted";
  return <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", color)} />;
}

function ImpactStars({ impact }: { impact: number | null }) {
  if (impact === null) return null;
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={12}
          className={cn(
            i < impact
              ? "fill-notion-orange text-notion-orange"
              : "text-notion-border",
          )}
        />
      ))}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSourceDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTypeLabel(type: string): string {
  return type
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function SignalCard({ signal }: { signal: Signal }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-notion-border rounded-md">
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-notion-bg-hover transition-colors"
      >
        {expanded ? (
          <ChevronDown size={16} className="text-notion-text-muted shrink-0" />
        ) : (
          <ChevronRight size={16} className="text-notion-text-muted shrink-0" />
        )}
        <SignalTypeDot type={signal.type} />
        <span className="flex-1 text-sm font-medium text-notion-text truncate">
          {signal.title}
        </span>
        {/* Source date badge — most recent publishedDate from sources */}
        {signal.sources.length > 0 && (
          <span className="shrink-0 text-xs text-notion-text-muted">
            {formatSourceDate(
              signal.sources
                .map((s) => s.publishedDate)
                .filter(Boolean)
                .sort()
                .pop() ?? signal.sources[0]!.publishedDate ?? "",
            )}
          </span>
        )}
        <ImpactStars impact={signal.impact} />
        {/* Detected at */}
        <span className="shrink-0 text-xs text-notion-text-muted">
          {formatDate(signal.createdAt)}
        </span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-notion-border">
          {/* Type label + date */}
          <div className="flex items-center gap-2 mt-3 mb-3">
            <span className="text-xs font-medium text-notion-text-muted bg-notion-bg-secondary px-2 py-0.5 rounded">
              {formatTypeLabel(signal.type)}
            </span>
            <span className="text-xs text-notion-text-muted">
              {formatDate(signal.createdAt)}
            </span>
          </div>

          {/* Quotes */}
          {signal.quotes.length > 0 && (
            <div className="space-y-3 mb-4">
              {signal.quotes.map((q, i) => (
                <blockquote
                  key={i}
                  className="border-l-2 border-notion-border pl-3 text-sm text-notion-text leading-relaxed"
                >
                  <p className="italic">&ldquo;{q.text}&rdquo;</p>
                  {(q.speaker || q.source) && (
                    <p className="text-xs text-notion-text-muted mt-1 not-italic">
                      {q.speaker && <span className="font-medium">{q.speaker}</span>}
                      {q.speaker && q.source && " — "}
                      {q.source && <span>{q.source}</span>}
                    </p>
                  )}
                </blockquote>
              ))}
            </div>
          )}

          {/* ICP Relevance */}
          <div className="mb-3">
            <h4 className="text-xs font-medium text-notion-text-muted uppercase tracking-wide mb-1">
              ICP Relevance
            </h4>
            <p className="text-sm text-notion-text leading-relaxed">
              {signal.icpRelevance}
            </p>
          </div>

          {/* Sources */}
          {signal.sources.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-notion-text-muted uppercase tracking-wide mb-1">
                Sources
              </h4>
              <div className="space-y-1">
                {signal.sources.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-notion-blue hover:underline"
                    >
                      <ExternalLink size={11} />
                      {s.title}
                    </a>
                    {s.publishedDate && (
                      <span className="text-xs text-notion-text-muted">
                        {formatSourceDate(s.publishedDate)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SignalsList({ signals }: SignalsListProps) {
  if (signals.length === 0) {
    return (
      <div>
        <h2 className="text-sm font-semibold text-notion-text mb-3">
          Signals
          <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-notion-bg-secondary text-notion-text-muted rounded-full">
            0
          </span>
        </h2>
        <p className="text-sm text-notion-text-muted py-6 text-center">
          No signals detected yet.
        </p>
      </div>
    );
  }

  const sorted = [...signals].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div>
      <h2 className="text-sm font-semibold text-notion-text mb-3">
        Signals
        <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-notion-bg-secondary text-notion-text-muted rounded-full">
          {signals.length}
        </span>
      </h2>
      <div className="space-y-2">
        {sorted.map((s) => (
          <SignalCard key={s.id} signal={s} />
        ))}
      </div>
    </div>
  );
}
