import { useSyncExternalStore, useCallback } from "react";
import type { OrgVisit } from "@/components/visit-tracker";

const STORAGE_KEY = "revenueos:recent-orgs";

// ── Snapshot cache (stable references for useSyncExternalStore) ─────────
const EMPTY: OrgVisit[] = [];
let cachedRaw: string | null = null;
let cachedParsed: OrgVisit[] = EMPTY;

function getSnapshot(): OrgVisit[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedParsed;
    cachedRaw = raw;
    cachedParsed = raw ? JSON.parse(raw) : EMPTY;
    return cachedParsed;
  } catch {
    return EMPTY;
  }
}

function getServerSnapshot(): OrgVisit[] {
  return EMPTY;
}

// ── Also re-read when the same tab writes (VisitTracker) ───────────────
let listeners: Set<() => void> = new Set();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);

  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cachedRaw = null; // invalidate cache
      callback();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

/** Notify all subscribers that localStorage changed (call after writing). */
function notifyListeners() {
  cachedRaw = null; // invalidate cache so next getSnapshot re-reads
  for (const cb of listeners) cb();
}

/**
 * Read the list of recently visited orgs from localStorage.
 * Updates live when another tab (or the VisitTracker) writes to the same key.
 */
export function useRecentOrgs(): OrgVisit[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Clear all recent orgs (e.g. for a "clear history" button).
 */
export function useClearRecentOrgs() {
  return useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      notifyListeners();
    } catch {
      // silently skip
    }
  }, []);
}

/** Called by VisitTracker after writing — re-read from the same tab. */
export function notifyRecentOrgsChanged() {
  notifyListeners();
}
