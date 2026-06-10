"use client";

import { Badge } from "@/components/ui/badge";
import type { Deal } from "@/lib/data";
import { cn } from "@/lib/utils";

interface DealsPipelineProps {
  deals: Deal[];
}

const STAGE_CONFIG = [
  { key: "discovery" as const, label: "Discovery", color: "bg-notion-bg-secondary text-notion-text" },
  { key: "qualified" as const, label: "Qualified", color: "bg-notion-blue text-white" },
  { key: "proposal" as const, label: "Proposal", color: "bg-notion-purple text-white" },
  { key: "negotiation" as const, label: "Negotiation", color: "bg-notion-orange text-white" },
  { key: "closed_won" as const, label: "Won", color: "bg-notion-green text-white" },
  { key: "closed_lost" as const, label: "Lost", color: "bg-notion-red text-white" },
];

function formatCurrency(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function DealCard({ deal }: { deal: Deal }) {
  const stageConf = STAGE_CONFIG.find((s) => s.key === deal.stage);
  const stageLabel = stageConf?.label ?? deal.stage;

  return (
    <div className="border border-notion-border rounded-md p-3 bg-white hover:bg-notion-bg-secondary transition-colors">
      {/* Title */}
      <h4 className="text-sm font-medium text-notion-text mb-2 leading-snug">
        {deal.title}
      </h4>

      {/* Value + Probability row */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-notion-text">
          {formatCurrency(deal.valueUsd)}
        </span>
        <span className="text-xs text-notion-text-muted">
          {deal.probability}% likely
        </span>
      </div>

      {/* Progress bar for probability */}
      <div className="w-full h-1 bg-notion-bg-secondary rounded-full mb-2">
        <div
          className={cn(
            "h-1 rounded-full transition-all",
            deal.probability >= 70
              ? "bg-notion-green"
              : deal.probability >= 40
                ? "bg-notion-orange"
                : "bg-notion-text-muted",
          )}
          style={{ width: `${deal.probability}%` }}
        />
      </div>

      {/* Contact + Close date */}
      <div className="flex items-center justify-between text-xs text-notion-text-muted">
        {deal.primaryContactName ? (
          <span className="truncate">{deal.primaryContactName}</span>
        ) : (
          <span>No contact</span>
        )}
        <span>{formatDate(deal.expectedCloseDate)}</span>
      </div>
    </div>
  );
}

export function DealsPipeline({ deals }: DealsPipelineProps) {
  // Group deals by stage
  const dealsByStage = new Map<string, Deal[]>();
  for (const stage of STAGE_CONFIG) {
    dealsByStage.set(stage.key, []);
  }
  for (const deal of deals) {
    const existing = dealsByStage.get(deal.stage) ?? [];
    existing.push(deal);
    dealsByStage.set(deal.stage, existing);
  }

  const totalDeals = deals.length;
  const totalValue = deals.reduce((sum, d) => sum + (d.valueUsd ?? 0), 0);

  if (totalDeals === 0) {
    return (
      <div>
        <h2 className="text-sm font-semibold text-notion-text mb-3">
          Pipeline
          <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-notion-bg-secondary text-notion-text-muted rounded-full">
            0
          </span>
        </h2>
        <p className="text-sm text-notion-text-muted py-6 text-center">
          No deals in the pipeline yet. Run the agent to discover opportunities.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header with totals */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-notion-text">
          Pipeline
          <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-notion-bg-secondary text-notion-text-muted rounded-full">
            {totalDeals}
          </span>
        </h2>
        <span className="text-sm text-notion-text-muted">
          Total: <span className="font-medium text-notion-text">{formatCurrency(totalValue)}</span>
        </span>
      </div>

      {/* Kanban columns */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {STAGE_CONFIG.map((stage) => {
          const stageDeals = dealsByStage.get(stage.key) ?? [];
          return (
            <div
              key={stage.key}
              className="flex-shrink-0 w-[220px] flex flex-col"
            >
              {/* Column header */}
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-medium text-notion-text-muted uppercase tracking-wider">
                  {stage.label}
                </span>
                <span className="text-xs text-notion-text-muted">
                  {stageDeals.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-2 min-h-[80px] bg-notion-bg-secondary rounded-md p-2">
                {stageDeals.length === 0 ? (
                  <div className="flex items-center justify-center h-16 text-xs text-notion-text-muted">
                    No deals
                  </div>
                ) : (
                  stageDeals.map((deal) => (
                    <DealCard key={deal.id} deal={deal} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
