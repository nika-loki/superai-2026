/**
 * Shared date formatting utilities for RevenueOS.
 * All functions accept ISO 8601 date strings and return consistent formats.
 */

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

const DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/** Returns "Jun 9, 2026" */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", DATE_OPTS);
}

/** Returns "Jun 9, 2026 at 6:30 AM" */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", DATETIME_OPTS);
}

/** Returns a human-friendly relative time string: "just now", "5m ago", "2h ago", "3d ago" */
export function relativeTime(iso: string | null): string {
  if (!iso) return "--";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}
