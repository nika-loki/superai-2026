import Link from "next/link";
import { Globe, Linkedin, ArrowLeft } from "lucide-react";
import type { Org } from "@/lib/data";
import { ScoreBadge } from "@/components/score-badge";
import { StatusBadge } from "@/components/status-badge";
import { RunAgentButtonClient } from "@/components/run-agent-button-client";
import { CompanyLogo } from "@/components/company-logo";
import { CollapsibleDescription } from "@/components/collapsible-description";
import { relativeTime, formatDateTime, formatDate } from "@/lib/format-date";

const COUNTRY_FLAGS: Record<string, string> = {
  Singapore: "\u{1F1F8}\u{1F1EC}",
  Australia: "\u{1F1E6}\u{1F1FA}",
  Indonesia: "\u{1F1EE}\u{1F1E9}",
};

interface OrgHeaderProps {
  org: Org;
  signalCount: number;
  taskCount: number;
  contactCount: number;
}

export function OrgHeader({ org, signalCount, taskCount, contactCount }: OrgHeaderProps) {
  const flag = COUNTRY_FLAGS[org.hqCountry] ?? "";
  const domainWithoutTld = org.domain.split(".")[0];

  return (
    <div className="px-8 pt-6 pb-6 border-b border-notion-border">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-notion-text-muted hover:text-notion-text transition-colors mb-4"
      >
        <ArrowLeft size={14} />
        Back to dashboard
      </Link>

      {/* Row 1: Logo + Name + External links */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <CompanyLogo domain={org.domain} name={org.name} size="lg" />
          <h1 className="text-2xl font-semibold text-notion-text">
            {org.name}
          </h1>
          <a
            href={`https://${org.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-notion-text-muted hover:text-notion-text transition-colors"
          >
            <Globe size={18} />
          </a>
          <a
            href={`https://linkedin.com/company/${domainWithoutTld}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-notion-text-muted hover:text-notion-text transition-colors"
          >
            <Linkedin size={18} />
          </a>
        </div>
        <RunAgentButtonClient orgId={org.id} hasActiveRun={org.hasActiveRun} />
      </div>

      {/* Row 2: Metadata */}
      <div className="flex items-center gap-3 mt-2 text-sm">
        <span>
          {flag} {org.hqCountry}
        </span>
        <span className="text-notion-border">|</span>
        <span className="text-notion-text-muted">{org.domain}</span>
        <span className="text-notion-border">|</span>
        <span
          className="text-notion-text-muted text-xs"
          title={org.lastResearchedAt ? formatDateTime(org.lastResearchedAt) : undefined}
        >
          Last researched: {relativeTime(org.lastResearchedAt)}
        </span>
        <span className="text-notion-border">|</span>
        {org.nextRunAt ? (
          <>
            <span
              className="text-notion-text-muted text-xs"
              title={`Scheduled for ${formatDateTime(org.nextRunAt)} (daily cron at midnight UTC)`}
            >
              Next refresh: {relativeTime(org.nextRunAt)}
            </span>
            {org.refreshIntervalDays && (
              <span className="text-notion-text-muted text-xs">
                (every {org.refreshIntervalDays}d)
              </span>
            )}
            <span className="text-notion-border">|</span>
          </>
        ) : (
          <>
            <span className="text-notion-text-muted text-xs" title="No refresh schedule set — the agent will configure this after its first research run">
              No refresh scheduled
            </span>
            <span className="text-notion-border">|</span>
          </>
        )}
        <StatusBadge status={org.status} />
        <span className="text-notion-border">|</span>
        <div className="flex items-center gap-1.5">
          <span className="text-notion-text-muted text-xs">ICP Score</span>
          <ScoreBadge score={org.opportunityScore} size="sm" />
        </div>
        <span className="text-notion-border">|</span>
        <span className="text-notion-text-muted text-xs">
          {signalCount} signals
        </span>
        <span className="text-notion-text-muted text-xs">
          {taskCount} tasks
        </span>
        <span className="text-notion-text-muted text-xs">
          {contactCount} contacts
        </span>
      </div>

      {/* Row 3: ICP description */}
      <CollapsibleDescription text={org.icpDescription} />

      {/* Properties */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
        {org.properties.map((p) => {
          // Format values that look like ISO dates
          const displayValue = /^\d{4}-\d{2}-\d{2}T/.test(p.value)
            ? formatDate(p.value)
            : p.value;
          return (
            <span key={p.key} className="text-xs">
              <span className="text-notion-text-muted">{p.key}:</span>{" "}
              <span className="text-notion-text font-medium">{displayValue}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
