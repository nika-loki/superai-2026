"use client";

import { useEffect, useRef } from "react";
import { notifyRecentOrgsChanged } from "@/lib/use-recent-orgs";

export interface OrgVisit {
  id: string;
  name: string;
  status: string;
  opportunityScore: number | null;
}

const STORAGE_KEY = "revenueos:recent-orgs";
const MAX_ORGS = 5;

export function VisitTracker({ org }: { org: OrgVisit }) {
  const tracked = useRef(false);

  useEffect(() => {
    // Guard against React strict-mode double-fire
    if (tracked.current) return;
    tracked.current = true;

    try {
      const stored: OrgVisit[] = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || "[]",
      );
      // Remove existing entry for this org, then prepend
      const filtered = stored.filter((o) => o.id !== org.id);
      filtered.unshift({
        id: org.id,
        name: org.name,
        status: org.status,
        opportunityScore: org.opportunityScore,
      });
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(filtered.slice(0, MAX_ORGS)),
      );
      // Notify the sidebar in this tab to re-read
      notifyRecentOrgsChanged();
    } catch {
      // localStorage unavailable — silently skip
    }
  }, [org]);

  return null;
}
