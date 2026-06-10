/**
 * RevenueOS Performance Audit Suite
 *
 * Playwright-based audit that:
 * 1. Navigates every page and records TTFB + page load times
 * 2. Captures API response times via network interception
 * 3. Extracts embedded __revenueos_perf__ timing data from server-rendered pages
 * 4. Tests search latency with debounced queries
 * 5. Measures pagination performance across large datasets
 * 6. Generates a comprehensive performance report
 *
 * Run: npx playwright test evals/performance/audit-performance.ts
 */

import { test, expect, type Page, type Response } from "@playwright/test";

// ── Types ──────────────────────────────────────────────────────────────

interface QueryTiming {
  label: string;
  durationMs: number;
  timestamp: string;
}

interface PagePerfReport {
  page: string;
  queries: QueryTiming[];
  totalDbMs: number;
  ttfbMs?: number;
}

interface ApiPerfEntry {
  url: string;
  method: string;
  status: number;
  durationMs: number;
  serverTiming?: string;
  perfData?: PagePerfReport;
}

interface AuditResult {
  timestamp: string;
  baseUrl: string;
  pages: {
    route: string;
    ttfbMs: number;
    loadMs: number;
    dbMs: number;
    queryCount: number;
    queries: QueryTiming[];
  }[];
  apis: ApiPerfEntry[];
  searchLatencies: { query: string; latencyMs: number; resultCount: number }[];
  paginationLatencies: { page: number; latencyMs: number }[];
  summary: {
    slowestPage: string;
    slowestApi: string;
    slowestQuery: { label: string; durationMs: number; page: string };
    totalAuditDurationMs: number;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const auditResults: AuditResult = {
  timestamp: new Date().toISOString(),
  baseUrl: BASE_URL,
  pages: [],
  apis: [],
  searchLatencies: [],
  paginationLatencies: [],
  summary: {
    slowestPage: "",
    slowestApi: "",
    slowestQuery: { label: "", durationMs: 0, page: "" },
    totalAuditDurationMs: 0,
  },
};

const auditStart = Date.now();

/**
 * Extract __revenueos_perf__ JSON from the page's embedded script tag.
 */
async function extractPerfData(page: Page): Promise<PagePerfReport | null> {
  return page.evaluate(() => {
    const script = document.getElementById("__revenueos_perf__");
    if (!script?.textContent) return null;
    try {
      return JSON.parse(script.textContent);
    } catch {
      return null;
    }
  });
}

/**
 * Time a page navigation and capture both TTFB and full load.
 */
async function timePageLoad(
  page: Page,
  url: string,
): Promise<{
  response: Response | null;
  ttfbMs: number;
  loadMs: number;
}> {
  const start = Date.now();
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  const ttfb = Date.now() - start;

  // Wait for the page to be fully rendered (network idle)
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
    // networkidle can timeout if there are long-lived connections
  });
  const loadMs = Date.now() - start;

  return { response, ttfbMs: ttfb, loadMs };
}

/**
 * Time a fetch call from within the browser context.
 */
async function timeApiCall(
  page: Page,
  url: string,
  method = "GET",
): Promise<ApiPerfEntry> {
  return page.evaluate(
    async ({ url, method }) => {
      const start = performance.now();
      const res = await fetch(url, { method });
      const body = await res.json();
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      return {
        url,
        method,
        status: res.status,
        durationMs,
        serverTiming: res.headers.get("server-timing") ?? undefined,
        perfData: body._perf ?? undefined,
      };
    },
    { url, method },
  );
}

// ── Audit Tests ────────────────────────────────────────────────────────

test.describe("RevenueOS Performance Audit", () => {
  test("Dashboard page load performance", async ({ page }) => {
    const { ttfbMs, loadMs } = await timePageLoad(page, `${BASE_URL}/`);

    const perfData = await extractPerfData(page);
    const dbMs = perfData?.totalDbMs ?? 0;
    const queryCount = perfData?.queries?.length ?? 0;

    auditResults.pages.push({
      route: "/",
      ttfbMs,
      loadMs,
      dbMs,
      queryCount,
      queries: perfData?.queries ?? [],
    });

    console.log(`\n📊 Dashboard (/) Performance:`);
    console.log(`   TTFB: ${ttfbMs}ms`);
    console.log(`   Full Load: ${loadMs}ms`);
    console.log(`   DB Time: ${dbMs}ms (${queryCount} queries)`);
    if (perfData?.queries) {
      for (const q of perfData.queries) {
        console.log(`     - ${q.label}: ${q.durationMs}ms`);
      }
    }

    // Verify page loaded correctly
    await expect(page.locator("h1")).toContainText("RevenueOS");

    // Performance budget assertions
    expect(ttfbMs).toBeLessThan(5000); // 5s TTFB budget
    expect(dbMs).toBeLessThan(3000); // 3s DB budget
  });

  test("Org detail page load performance", async ({ page }) => {
    // First get an org ID from the dashboard
    await page.goto(`${BASE_URL}/`);
    const orgLink = page.locator('a[href^="/org/"]').first();
    const orgHref = await orgLink.getAttribute("href");
    expect(orgHref).toBeTruthy();

    const { ttfbMs, loadMs } = await timePageLoad(
      page,
      `${BASE_URL}${orgHref}`,
    );

    const perfData = await extractPerfData(page);
    const dbMs = perfData?.totalDbMs ?? 0;
    const queryCount = perfData?.queries?.length ?? 0;

    auditResults.pages.push({
      route: orgHref!,
      ttfbMs,
      loadMs,
      dbMs,
      queryCount,
      queries: perfData?.queries ?? [],
    });

    console.log(`\n📊 Org Detail (${orgHref}) Performance:`);
    console.log(`   TTFB: ${ttfbMs}ms`);
    console.log(`   Full Load: ${loadMs}ms`);
    console.log(`   DB Time: ${dbMs}ms (${queryCount} queries)`);
    if (perfData?.queries) {
      for (const q of perfData.queries) {
        console.log(`     - ${q.label}: ${q.durationMs}ms`);
      }
    }

    expect(ttfbMs).toBeLessThan(8000); // 8s budget (6+ queries)
    expect(dbMs).toBeLessThan(5000);
  });

  test("Org detail API endpoint performance", async ({ page }) => {
    // Get org ID from dashboard
    await page.goto(`${BASE_URL}/`);
    const orgId = await page
      .locator('a[href^="/org/"]')
      .first()
      .getAttribute("href");
    expect(orgId).toBeTruthy();

    // Time the API call
    const apiResult = await timeApiCall(
      page,
      `${BASE_URL}/api/orgs${orgId}`,
    );
    auditResults.apis.push(apiResult);

    console.log(`\n📊 API /api/orgs${orgId} Performance:`);
    console.log(`   Response Time: ${apiResult.durationMs}ms`);
    console.log(`   Status: ${apiResult.status}`);
    if (apiResult.perfData) {
      console.log(
        `   DB Time: ${apiResult.perfData.totalDbMs}ms (${apiResult.perfData.queries?.length ?? 0} queries)`,
      );
      for (const q of apiResult.perfData.queries ?? []) {
        console.log(`     - ${q.label}: ${q.durationMs}ms`);
      }
    }
    if (apiResult.serverTiming) {
      console.log(`   Server-Timing: ${apiResult.serverTiming}`);
    }

    expect(apiResult.status).toBe(200);
    expect(apiResult.durationMs).toBeLessThan(5000);
  });

  test("Search API latency", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);

    const searchQueries = ["canva", "grab", "security", "ai", "singapore"];
    for (const query of searchQueries) {
      const result = await timeApiCall(
        page,
        `${BASE_URL}/api/orgs/search?q=${encodeURIComponent(query)}`,
      );

      const body = await page.evaluate(
        async (url) => {
          const r = await fetch(url);
          return r.json();
        },
        `${BASE_URL}/api/orgs/search?q=${encodeURIComponent(query)}`,
      );

      auditResults.searchLatencies.push({
        query,
        latencyMs: result.durationMs,
        resultCount: Array.isArray(body) ? body.length : 0,
      });

      console.log(
        `   🔍 Search "${query}": ${result.durationMs}ms (${Array.isArray(body) ? body.length : 0} results)`,
      );
    }

    // All searches should be under 2s
    for (const s of auditResults.searchLatencies) {
      expect(s.latencyMs).toBeLessThan(2000);
    }
  });

  test("Pagination performance", async ({ page }) => {
    const pages = [1, 2, 5, 10, 50, 96];

    for (const pageNum of pages) {
      const start = Date.now();
      const response = await page.goto(
        `${BASE_URL}/?page=${pageNum}`,
        { waitUntil: "domcontentloaded" },
      );
      const durationMs = Date.now() - start;

      auditResults.paginationLatencies.push({
        page: pageNum,
        latencyMs: durationMs,
      });

      console.log(`   📄 Page ${pageNum}: ${durationMs}ms (status ${response?.status()})`);

      // Verify correct page loaded
      const paginationText = await page
        .locator("text=/Showing \\d+–\\d+ of \\d+/")
        .textContent()
        .catch(() => "");
      expect(paginationText).toBeTruthy();
    }

    // Last page shouldn't be significantly slower than first
    const firstPage = auditResults.paginationLatencies.find(
      (p) => p.page === 1,
    )!;
    const lastPage = auditResults.paginationLatencies.find(
      (p) => p.page === 96,
    )!;
    // Allow 3x slack for offset-heavy queries
    expect(lastPage.latencyMs).toBeLessThan(firstPage.latencyMs * 3);
  });

  test("Settings page load performance", async ({ page }) => {
    const { ttfbMs, loadMs } = await timePageLoad(
      page,
      `${BASE_URL}/settings`,
    );

    auditResults.pages.push({
      route: "/settings",
      ttfbMs,
      loadMs,
      dbMs: 0,
      queryCount: 0,
      queries: [],
    });

    console.log(`\n📊 Settings Performance:`);
    console.log(`   TTFB: ${ttfbMs}ms`);
    console.log(`   Full Load: ${loadMs}ms`);

    expect(ttfbMs).toBeLessThan(5000);
  });

  test("Billing page load performance", async ({ page }) => {
    const { ttfbMs, loadMs } = await timePageLoad(
      page,
      `${BASE_URL}/billing`,
    );

    auditResults.pages.push({
      route: "/billing",
      ttfbMs,
      loadMs,
      dbMs: 0,
      queryCount: 0,
      queries: [],
    });

    console.log(`\n📊 Billing Performance:`);
    console.log(`   TTFB: ${ttfbMs}ms`);
    console.log(`   Full Load: ${loadMs}ms`);

    expect(ttfbMs).toBeLessThan(3000);
  });

  test("Generate summary report", async ({ page }) => {
    // Calculate summary
    const slowestPage = auditResults.pages.reduce(
      (max, p) => (p.ttfbMs > max.ttfbMs ? p : max),
      auditResults.pages[0],
    );

    const slowestApi = auditResults.apis.reduce(
      (max, a) => (a.durationMs > max.durationMs ? a : max),
      auditResults.apis[0] ?? { url: "N/A", durationMs: 0, method: "", status: 0 },
    );

    let slowestQuery: { label: string; durationMs: number; page: string } = {
      label: "N/A",
      durationMs: 0,
      page: "N/A",
    };
    for (const p of auditResults.pages) {
      for (const q of p.queries) {
        if (q.durationMs > slowestQuery.durationMs) {
          slowestQuery = {
            label: q.label,
            durationMs: q.durationMs,
            page: p.route,
          };
        }
      }
    }

    auditResults.summary = {
      slowestPage: `${slowestPage?.route} (${slowestPage?.ttfbMs}ms TTFB)`,
      slowestApi: `${slowestApi?.url} (${slowestApi?.durationMs}ms)`,
      slowestQuery,
      totalAuditDurationMs: Date.now() - auditStart,
    };

    console.log("\n\n" + "═".repeat(70));
    console.log("  RevenueOS Performance Audit Report");
    console.log("═".repeat(70));
    console.log(`  Timestamp: ${auditResults.timestamp}`);
    console.log(`  Base URL: ${auditResults.baseUrl}`);
    console.log(`  Total Audit Duration: ${auditResults.summary.totalAuditDurationMs}ms`);
    console.log("─".repeat(70));

    console.log("\n  📄 PAGE PERFORMANCE:");
    console.log("  " + "-".repeat(50));
    for (const p of auditResults.pages) {
      console.log(
        `  ${p.route.padEnd(30)} TTFB: ${String(p.ttfbMs).padStart(6)}ms  DB: ${String(p.dbMs).padStart(6)}ms  (${p.queryCount} queries)`,
      );
    }

    if (auditResults.apis.length > 0) {
      console.log("\n  🔌 API PERFORMANCE:");
      console.log("  " + "-".repeat(50));
      for (const a of auditResults.apis) {
        console.log(
          `  ${a.url.padEnd(40)} ${a.durationMs}ms (status ${a.status})`,
        );
        if (a.perfData) {
          console.log(
            `    DB: ${a.perfData.totalDbMs}ms (${a.perfData.queries?.length ?? 0} queries)`,
          );
        }
      }
    }

    if (auditResults.searchLatencies.length > 0) {
      console.log("\n  🔍 SEARCH LATENCY:");
      console.log("  " + "-".repeat(50));
      for (const s of auditResults.searchLatencies) {
        console.log(
          `  "${s.query}".padEnd(15) ${s.latencyMs}ms (${s.resultCount} results)`,
        );
      }
    }

    if (auditResults.paginationLatencies.length > 0) {
      console.log("\n  📄 PAGINATION LATENCY:");
      console.log("  " + "-".repeat(50));
      for (const p of auditResults.paginationLatencies) {
        console.log(`  Page ${String(p.page).padStart(3)}: ${p.latencyMs}ms`);
      }
    }

    console.log("\n  ⚡ SUMMARY:");
    console.log("  " + "-".repeat(50));
    console.log(`  Slowest Page: ${auditResults.summary.slowestPage}`);
    console.log(`  Slowest API:  ${auditResults.summary.slowestApi}`);
    console.log(
      `  Slowest Query: ${auditResults.summary.slowestQuery.label} (${auditResults.summary.slowestQuery.durationMs}ms on ${auditResults.summary.slowestQuery.page})`,
    );
    console.log("═".repeat(70) + "\n");
  });
});
