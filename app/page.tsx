import { db } from "@/agent/lib/db/index";
import { organisations, signals } from "@/agent/lib/db/schema";
import { count, sql, inArray } from "drizzle-orm";
import { DashboardTableClient } from "@/components/dashboard-table-client";
import { SearchAccountsHint } from "@/components/search-accounts-hint";
import { RequestTimer } from "@/agent/lib/db/timing";
import { storePerfData } from "@/agent/lib/db/perf-store";

type OrgRow = typeof organisations.$inferSelect;

export const dynamic = "force-dynamic";

// In-memory cache for total org count — rarely changes, saves 200ms per page load
let cachedTotalCount = 0;
let cachedTotalCountAt = 0;
const COUNT_CACHE_TTL_MS = 60_000; // 1 minute

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const timer = new RequestTimer("dashboard");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1"));
  const pageSize = 10;
  const offset = (page - 1) * pageSize;

  // Count total organisations (cached for 60s)
  const now = Date.now();
  let totalCount = cachedTotalCount;
  if (now - cachedTotalCountAt > COUNT_CACHE_TTL_MS) {
    [{ count: totalCount }] = await timer.timed<{ count: number }[]>("count-orgs", () =>
      db.select({ count: count() }).from(organisations),
    );
    cachedTotalCount = totalCount;
    cachedTotalCountAt = now;
  } else {
    timer.timed("count-orgs-cached", async () => {}); // record cache hit
  }

  // Fetch page of orgs ordered by opportunity score
  const orgs = await timer.timed<OrgRow[]>("page-orgs", () =>
    db
      .select()
      .from(organisations)
      .orderBy(sql`COALESCE(${organisations.opportunityScore}, 0) DESC`)
      .limit(pageSize)
      .offset(offset),
  );

  // Fetch signal counts only for the orgs on this page
  const orgIds = orgs.map((o: OrgRow) => o.id);

  const signalCounts = orgIds.length > 0
    ? await timer.timed<{ orgId: string | null; count: number }[]>("signal-counts", () =>
        db
          .select({
            orgId: signals.orgId,
            count: count(),
          })
          .from(signals)
          .where(inArray(signals.orgId, orgIds))
          .groupBy(signals.orgId),
      )
    : [];

  const signalCountMap = new Map(
    signalCounts.map((r: { orgId: string | null; count: number }) => [r.orgId, r.count]),
  );

  const rows = orgs.map((org: OrgRow) => ({
    id: org.id,
    name: org.name,
    domain: org.domain,
    hqCountry: org.hqCountry,
    opportunityScore: org.opportunityScore,
    status: org.status ?? "onboarding",
    lastResearchedAt: org.lastResearchedAt?.toISOString() ?? null,
    nextRunAt: org.nextRunAt?.toISOString() ?? null,
    refreshIntervalDays: org.refreshIntervalDays ?? null,
    signalCount: signalCountMap.get(org.id) ?? 0,
  }));

  // Inject performance data — stored server-side, fetchable via /api/perf
  const report = timer.toReport();
  storePerfData("dashboard", report);
  console.log("[perf] dashboard:", JSON.stringify(report));

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Hidden timing data for Playwright to extract */}
      <div
        id="__revenueos_perf__"
        data-perf={JSON.stringify(report)}
        style={{ display: "none" }}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-notion-text">
            Dashboard
          </h1>
          <p className="text-sm text-notion-text-muted mt-0.5">
            APAC Account Intelligence
          </p>
        </div>
        <SearchAccountsHint />
      </div>

      <DashboardTableClient
        orgs={rows}
        totalCount={totalCount}
        currentPage={page}
        pageSize={pageSize}
      />
    </div>
  );
}
