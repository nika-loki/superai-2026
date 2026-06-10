"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CompanyLogo } from "@/components/company-logo";
import { ScoreBadge } from "@/components/score-badge";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { relativeTime, formatDateTime } from "@/lib/format-date";

const COUNTRY_FLAGS: Record<string, string> = {
  Singapore: "\u{1F1F8}\u{1F1EC}",
  Australia: "\u{1F1E6}\u{1F1FA}",
  Indonesia: "\u{1F1EE}\u{1F1E9}",
};

type OrgRow = {
  id: string;
  name: string;
  domain: string;
  hqCountry: string;
  opportunityScore: number | null;
  status: string;
  lastResearchedAt: string | null;
  nextRunAt: string | null;
  refreshIntervalDays: number | null;
  signalCount: number;
};

export function OrgTableBody({ orgs }: { orgs: OrgRow[] }) {
  const router = useRouter();

  return (
    <tbody>
      {orgs.map((org) => {
        const flag = COUNTRY_FLAGS[org.hqCountry] ?? "";
        return (
          <tr
            key={org.id}
            onClick={() => router.push(`/org/${org.id}`)}
            className="cursor-pointer hover:bg-notion-bg-hover transition-colors"
          >
            <td>
              <span className="inline-flex items-center gap-2.5 font-medium text-notion-text">
                <CompanyLogo domain={org.domain} name={org.name} size="sm" />
                {org.name}
              </span>
            </td>
            <td className="text-notion-text-muted text-sm">
              {org.domain}
            </td>
            <td className="text-sm">
              <span className="inline-flex items-center gap-1.5">
                <span>{flag}</span>
                <span>{org.hqCountry}</span>
              </span>
            </td>
            <td>
              <ScoreBadge score={org.opportunityScore} size="sm" />
            </td>
            <td>
              <StatusBadge status={org.status as "onboarding" | "active" | "paused" | "churned"} />
            </td>
            <td
              className="text-sm text-notion-text-muted"
              title={org.lastResearchedAt ? formatDateTime(org.lastResearchedAt) : undefined}
            >
              {relativeTime(org.lastResearchedAt)}
            </td>
            <td
              className="text-sm text-notion-text-muted"
              title={org.nextRunAt ? formatDateTime(org.nextRunAt) : undefined}
            >
              {org.nextRunAt ? (
                <span>
                  {relativeTime(org.nextRunAt)}
                  <span className="text-notion-text-muted text-[11px] ml-1">
                    ({org.refreshIntervalDays ?? "?"}d)
                  </span>
                </span>
              ) : (
                <span className="text-notion-text-muted">No schedule</span>
              )}
            </td>
            <td className="text-sm tabular-nums">
              {org.signalCount}
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}
