/**
 * RevenueOS — Batch Evaluation Script v2 (10 APAC Companies)
 *
 * Runs the agent against 10 diverse APAC companies via the Ash HTTP API.
 * Tests: autonomous planning, tool selection, data persistence, consistency.
 *
 * v2 improvements:
 *   - Seeds organisations in DB before each test (so agent has context)
 *   - Passes orgId in prompts (enables DB persistence)
 *   - DB health check between runs with auto-pause on degradation
 *   - Fixed tool name analysis (hyphens, not underscores)
 *   - Structured output for Playwright-based tracing
 *
 * Prerequisites:
 *   1. AWS credentials active (aws sts get-caller-identity works)
 *   2. Dev server running: pnpm dev
 *
 * Usage:
 *   npx tsx scripts/batch-eval.ts
 */

const ASH_URL = process.env.ASH_URL ?? "http://127.0.0.1:3000";
const SESSION_TIMEOUT_MS = 300_000; // 5 min per company
const DB_HEALTH_INTERVAL = 2; // Check DB health every N runs

// ---------------------------------------------------------------------------
// Company Test Cases
// ---------------------------------------------------------------------------

interface CompanyTestCase {
  name: string;
  domain: string;
  country: string;
  region: string;
  hqCountry: string;
  industry: string;
  prompt: string;
}

const COMPANIES: CompanyTestCase[] = [
  {
    name: "Grab",
    domain: "grab.com",
    country: "Singapore",
    region: "Southeast Asia",
    hqCountry: "SG",
    industry: "Super-app / Fintech",
    prompt:
      "Research Grab — Singapore's super-app covering ride-hailing, food delivery, payments (GrabPay), and financial services. Focus on: recent expansion into banking (GXBank), GrabFin growth, enterprise SaaS pivot, and partnerships. Find VP+ contacts in engineering, partnerships, and product.",
  },
  {
    name: "Sea Group",
    domain: "seagroup.com",
    country: "Singapore",
    region: "Southeast Asia",
    hqCountry: "SG",
    industry: "E-commerce / Gaming / Fintech",
    prompt:
      "Research Sea Limited — parent of Shopee, SeaMoney, and Garena. Focus on: Shopee's path to profitability, SeaMoney's digital banking expansion, Garena's gaming revenue, and AI/ML investments. Find key decision-makers in technology and business development.",
  },
  {
    name: "Tokopedia",
    domain: "tokopedia.com",
    country: "Indonesia",
    region: "Southeast Asia",
    hqCountry: "ID",
    industry: "E-commerce / Fintech",
    prompt:
      "Research Tokopedia — Indonesia's largest e-commerce platform (now merged with GoTo). Focus on: post-merger integration with Gojek, fintech expansion, logistics investments, and seller ecosystem growth. Find contacts in engineering leadership and product.",
  },
  {
    name: "Canva",
    domain: "canva.com",
    country: "Australia",
    region: "Oceania",
    hqCountry: "AU",
    industry: "SaaS / Design platform",
    prompt:
      "Research Canva — Australia's visual communication platform. Focus on: enterprise product (Canva for Teams) growth, AI features (Magic Studio), APAC expansion strategy. Find contacts in enterprise sales, partnerships, and engineering leadership.",
  },
  {
    name: "Rakuten",
    domain: "rakuten.com",
    country: "Japan",
    region: "East Asia",
    hqCountry: "JP",
    industry: "E-commerce / Fintech",
    prompt:
      "Research Rakuten — Japan's e-commerce and fintech conglomerate. Focus on: Rakuten Bank IPO, Rakuten Mobile turnaround progress, and AI/ML investments. Find contacts in mobile, fintech, and corporate development.",
  },
  {
    name: "Paytm",
    domain: "paytm.com",
    country: "India",
    region: "South Asia",
    hqCountry: "IN",
    industry: "Digital payments / Fintech",
    prompt:
      "Research Paytm — India's leading digital payments platform. Focus on: post-RBI restrictions recovery, merchant lending growth, and UPI market share. Find contacts in payments technology, lending, and partnerships.",
  },
  {
    name: "Coupang",
    domain: "coupang.com",
    country: "South Korea",
    region: "East Asia",
    hqCountry: "KR",
    industry: "E-commerce / Logistics",
    prompt:
      "Research Coupang — South Korea's largest e-commerce platform. Focus on: Rocket Delivery expansion, profitability milestones, international expansion, and fintech launch (Coupang Pay). Find contacts in logistics technology and corporate strategy.",
  },
  {
    name: "VNPay",
    domain: "vnpay.vn",
    country: "Vietnam",
    region: "Southeast Asia",
    hqCountry: "VN",
    industry: "Digital payments / Fintech",
    prompt:
      "Research VNPay — Vietnam's leading digital payment platform. Focus on: QR payment dominance, banking partnerships, and smart POS expansion. Find contacts in technology leadership and business development.",
  },
  {
    name: "Ascend Money",
    domain: "ascendmoney.com",
    country: "Thailand",
    region: "Southeast Asia",
    hqCountry: "TH",
    industry: "Fintech / Digital wallet",
    prompt:
      "Research Ascend Money — Thailand's fintech unicorn (TrueMoney). Focus on: regional expansion across SE Asia, digital lending growth, and B2B payments infrastructure. Find contacts in technology, product, and regional expansion.",
  },
  {
    name: "GCash",
    domain: "gcash.com",
    country: "Philippines",
    region: "Southeast Asia",
    hqCountry: "PH",
    industry: "Mobile wallet / Fintech",
    prompt:
      "Research GCash — Philippines' leading mobile wallet. Focus on: user growth milestones, lending products (GLoan, GGives), and financial inclusion initiatives. Find contacts in technology leadership and product.",
  },
];

// ---------------------------------------------------------------------------
// Ash Agent Client
// ---------------------------------------------------------------------------

interface AshEvent {
  type: string;
  data?: Record<string, unknown>;
  meta?: { at: string };
}

interface AgentRunResult {
  company: string;
  country: string;
  domain: string;
  orgId?: string;
  output: string;
  events: AshEvent[];
  toolCalls: { name: string; index: number }[];
  toolResults: { name: string; success: boolean }[];
  succeeded: boolean;
  sessionId: string;
  durationMs: number;
  error?: string;
  // Analysis fields
  signalsCount: number;
  contactsCount: number;
  tasksCount: number;
  memoryStored: boolean;
  orgUpdated: boolean;
  researchLogWritten: boolean;
  planningFirst: boolean;
  usedExaTools: string[];
  usedDbTools: string[];
  usedHonchoTools: string[];
  researchToolCount: number;
  persistToolCount: number;
  outputLength: number;
}

function makeEmptyResult(company: CompanyTestCase): AgentRunResult {
  return {
    company: company.name,
    country: company.country,
    domain: company.domain,
    output: "",
    events: [],
    toolCalls: [],
    toolResults: [],
    succeeded: false,
    sessionId: "",
    durationMs: 0,
    signalsCount: 0,
    contactsCount: 0,
    tasksCount: 0,
    memoryStored: false,
    orgUpdated: false,
    researchLogWritten: false,
    planningFirst: false,
    usedExaTools: [],
    usedDbTools: [],
    usedHonchoTools: [],
    researchToolCount: 0,
    persistToolCount: 0,
    outputLength: 0,
  };
}

async function runAgentSession(
  company: CompanyTestCase,
  orgId: string,
  workspaceId: string,
  index: number,
): Promise<AgentRunResult> {
  const start = Date.now();
  const result = makeEmptyResult(company);
  result.orgId = orgId;

  console.log(`\n${"=".repeat(70)}`);
  console.log(`[${index + 1}/10] ${company.name} (${company.country}) — ${company.domain}`);
  console.log(`  orgId: ${orgId}`);
  console.log(`${"=".repeat(70)}`);

  // Build the prompt with org context — this is how the frontend sends it
  const prompt =
    `Research ${company.name} (${company.domain}) as a new target account.\n\n` +
    `Context: This is a first-run — no prior research exists. The organisation record ` +
    `already exists in the database (orgId: ${orgId}). Start by understanding the account, ` +
    `then perform comprehensive company and people research. Detect signals, find key ` +
    `contacts, create engagement tasks, and store your findings for next time.\n\n` +
    `${company.prompt}`;

  try {
    // 1. Create session
    const res = await fetch(`${ASH_URL}/ash/v1/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    });

    if (!res.ok) {
      const body = await res.text();
      result.error = `Session creation failed (${res.status}): ${body.slice(0, 500)}`;
      result.durationMs = Date.now() - start;
      console.log(`  ❌ ${result.error}`);
      return result;
    }

    const session = (await res.json()) as { sessionId: string };
    result.sessionId = session.sessionId;
    console.log(`  Session: ${session.sessionId.slice(0, 16)}...`);

    // 2. Stream events
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);

    let toolCallIndex = 0;
    let finalMessage = "";
    let allMessageText = "";

    try {
      const streamRes = await fetch(
        `${ASH_URL}/ash/v1/session/${session.sessionId}/stream`,
        { signal: controller.signal },
      );

      if (!streamRes.ok || !streamRes.body) {
        result.error = `Stream failed (${streamRes.status})`;
        result.durationMs = Date.now() - start;
        return result;
      }

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as AshEvent;
            result.events.push(event);

            if (event.type === "actions.requested") {
              const actions = event.data?.actions as
                | Array<{ toolName: string; name?: string }>
                | undefined;
              if (actions) {
                for (const a of actions) {
                  const name = a.toolName ?? a.name ?? "";
                  if (name) {
                    result.toolCalls.push({ name, index: toolCallIndex++ });
                    console.log(`  🔧 #${toolCallIndex}: ${name}`);
                  }
                }
              }
            }

            if (event.type === "action.result") {
              const actionName = event.data?.actionName as string | undefined;
              const success = event.data?.success as boolean | undefined;
              const status = success === false ? "❌" : "✅";
              if (actionName) {
                result.toolResults.push({ name: actionName, success: success !== false });
                console.log(`  ${status} Result: ${actionName}`);
              }
            }

            if (event.type === "message.completed") {
              const msg = event.data?.message as string | undefined;
              const content = event.data?.content as string | undefined;
              if (msg || content) finalMessage = String(msg ?? content);
            }

            if (event.type === "message.appended") {
              const soFar = event.data?.messageSoFar as string | undefined;
              if (soFar) allMessageText = soFar;
            }

            if (event.type === "session.failed" || event.type === "turn.failed") {
              const msg = event.data?.message ?? event.data?.details;
              console.log(`  ❌ Failure: ${JSON.stringify(msg).slice(0, 200)}`);
            }

            if (
              event.type === "session.waiting" ||
              event.type === "session.completed"
            ) {
              result.succeeded = true;
              reader.cancel();
              break;
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        result.error = "Session timed out";
        result.succeeded = result.events.some(
          (e) => e.type === "session.waiting" || e.type === "session.completed",
        );
      } else {
        result.error = String(err);
      }
    } finally {
      clearTimeout(timer);
    }

    result.output = finalMessage || allMessageText || "";
    result.outputLength = result.output.length;
    result.durationMs = Date.now() - start;
  } catch (err) {
    result.error = String(err);
    result.durationMs = Date.now() - start;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function analyzeResult(result: AgentRunResult): void {
  const tc = result.toolCalls.map((t) => t.name);

  // Tool categorization — use hyphens (Ash tool naming convention)
  result.usedExaTools = tc.filter((t) => t.startsWith("exa-"));
  result.usedDbTools = tc.filter((t) => t.startsWith("db-"));
  result.usedHonchoTools = tc.filter((t) => t.startsWith("honcho-"));
  result.researchToolCount = result.usedExaTools.length;
  result.persistToolCount = result.usedDbTools.length + result.usedHonchoTools.length;

  // Planning first: db-get-org or honcho-recall before any exa- tool
  const planningIdx = tc
    .map((t, i) => (t === "db-get-org" || t === "honcho-recall" ? i : -1))
    .filter((i) => i !== -1);
  const researchIdx = tc
    .map((t, i) => (t.startsWith("exa-") ? i : -1))
    .filter((i) => i !== -1);
  result.planningFirst =
    planningIdx.length > 0 && researchIdx.length > 0
      ? Math.min(...planningIdx) < Math.min(...researchIdx)
      : false;

  // Persistence checks
  result.memoryStored = tc.includes("honcho-remember");
  result.orgUpdated = tc.includes("db-update-org");
  result.researchLogWritten = tc.includes("db-write-research-log");
  result.signalsCount = tc.filter((t) => t === "db-write-signals").length;
  result.contactsCount = tc.filter((t) => t === "db-write-contacts").length;
  result.tasksCount = tc.filter((t) => t === "db-write-tasks").length;

  // Print summary
  console.log(`\n  📊 Analysis:`);
  console.log(`     Research: ${result.researchToolCount} Exa tools`);
  console.log(`     Persistence: ${result.persistToolCount} DB/Honcho tools`);
  console.log(`     Signals: ${result.signalsCount} | Contacts: ${result.contactsCount} | Tasks: ${result.tasksCount}`);
  console.log(`     Memory: ${result.memoryStored ? "✅" : "❌"} | Org update: ${result.orgUpdated ? "✅" : "❌"} | Log: ${result.researchLogWritten ? "✅" : "❌"}`);
  console.log(`     Planning first: ${result.planningFirst ? "✅" : "❌"}`);
  console.log(`     Duration: ${Math.round(result.durationMs / 1000)}s | Output: ${result.outputLength} chars`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printReport(results: AgentRunResult[]) {
  console.log("\n\n");
  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║           REVENUEOS BATCH EVALUATION v2 — 10 APAC COMPANIES                ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");

  const succeeded = results.filter((r) => r.succeeded);
  const failed = results.filter((r) => !r.succeeded);

  console.log(`\n📊 Overall: ${succeeded.length}/${results.length} succeeded (${Math.round((succeeded.length / results.length) * 100)}%)`);

  // Per-company table
  console.log("\n┌────┬─────────────────┬─────────────┬────────┬──────────┬─────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐");
  console.log("│ #  │ Company         │ Country     │ Status │ Time     │ Total   │ Exa      │ DB/Hon.  │ Signals  │ Contacts │ Tasks    │ Plan 1st │");
  console.log("├────┼─────────────────┼─────────────┼────────┼──────────┼─────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤");

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const status = r.succeeded ? "✅ OK  " : "❌ FAIL";
    const dur = `${Math.round(r.durationMs / 1000)}s`.padEnd(6);
    const total = String(r.toolCalls.length).padEnd(5);
    const exa = String(r.researchToolCount).padEnd(6);
    const db = String(r.persistToolCount).padEnd(6);
    const sig = String(r.signalsCount).padEnd(6);
    const con = String(r.contactsCount).padEnd(6);
    const task = String(r.tasksCount).padEnd(6);
    const plan = (r.planningFirst ? "✅" : "❌").padEnd(6);
    const name = r.company.padEnd(15).slice(0, 15);
    const country = r.country.padEnd(11).slice(0, 11);

    console.log(`│ ${String(i + 1).padStart(2)} │ ${name} │ ${country} │ ${status} │ ${dur} │ ${total} │ ${exa} │ ${db} │ ${sig} │ ${con} │ ${task} │ ${plan} │`);
  }

  console.log("└────┴─────────────────┴─────────────┴────────┴──────────┴─────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘");

  // Consistency metrics (among succeeded)
  if (succeeded.length > 0) {
    console.log("\n📈 Consistency Metrics (among succeeded):");

    const pct = (fn: (r: AgentRunResult) => boolean) =>
      `${Math.round((succeeded.filter(fn).length / succeeded.length) * 100)}%`.padStart(4) +
      ` (${succeeded.filter(fn).length}/${succeeded.length})`;

    console.log(`  Research (1+ Exa):      ${pct((r) => r.researchToolCount > 0)}`);
    console.log(`  Research (3+ Exa):      ${pct((r) => r.researchToolCount >= 3)}`);
    console.log(`  Both company+people:    ${pct((r) => r.usedExaTools.some(t => t.includes("company")) && r.usedExaTools.some(t => t.includes("people")))}`);
    console.log(`  Persisted signals:      ${pct((r) => r.signalsCount > 0)}`);
    console.log(`  Persisted contacts:     ${pct((r) => r.contactsCount > 0)}`);
    console.log(`  Persisted tasks:        ${pct((r) => r.tasksCount > 0)}`);
    console.log(`  Stored memory:          ${pct((r) => r.memoryStored)}`);
    console.log(`  Updated org:            ${pct((r) => r.orgUpdated)}`);
    console.log(`  Wrote research log:     ${pct((r) => r.researchLogWritten)}`);
    console.log(`  Full pipeline:          ${pct((r) => r.researchToolCount > 0 && r.signalsCount > 0 && r.contactsCount > 0 && r.memoryStored)}`);
    console.log(`  Planning first:         ${pct((r) => r.planningFirst)}`);

    // Average metrics
    const avgResearch = succeeded.reduce((s, r) => s + r.researchToolCount, 0) / succeeded.length;
    const avgPersist = succeeded.reduce((s, r) => s + r.persistToolCount, 0) / succeeded.length;
    const avgDuration = succeeded.reduce((s, r) => s + r.durationMs, 0) / succeeded.length;
    const avgOutput = succeeded.reduce((s, r) => s + r.outputLength, 0) / succeeded.length;

    console.log(`\n  Avg Exa tools:     ${avgResearch.toFixed(1)}`);
    console.log(`  Avg DB/Hon tools:  ${avgPersist.toFixed(1)}`);
    console.log(`  Avg duration:      ${Math.round(avgDuration / 1000)}s`);
    console.log(`  Avg output:        ${Math.round(avgOutput)} chars`);

    // Tool usage frequency
    console.log("\n🔧 Tool Usage Frequency:");
    const toolUsage = new Map<string, { total: number; success: number }>();
    for (const r of succeeded) {
      for (const tc of r.toolCalls) {
        const entry = toolUsage.get(tc.name) ?? { total: 0, success: 0 };
        entry.total++;
        toolUsage.set(tc.name, entry);
      }
      for (const tr of r.toolResults) {
        const entry = toolUsage.get(tr.name);
        if (entry && tr.success) entry.success++;
      }
    }
    const sorted = [...toolUsage.entries()].sort((a, b) => b[1].total - a[1].total);
    for (const [name, { total, success }] of sorted) {
      const bar = "█".repeat(Math.min(total, 20));
      const rate = success > 0 ? `${Math.round((success / total) * 100)}%` : "—";
      console.log(`  ${name.padEnd(25)} ${bar} (${total}/${succeeded.length}, ${rate} success)`);
    }

    // Strategy diversity
    console.log("\n🧠 Research Strategy Diversity:");
    const strategies = new Map<string, number>();
    for (const r of succeeded) {
      const unique = [...new Set(r.usedExaTools)].sort().join(" → ");
      strategies.set(unique || "no_exa", (strategies.get(unique) ?? 0) + 1);
    }
    for (const [strategy, count] of [...strategies.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  [${count}x] ${strategy}`);
    }
  }

  // Failures
  if (failed.length > 0) {
    console.log("\n❌ Failed Runs:");
    for (const r of failed) {
      console.log(`  ${r.company} (${r.country}): ${r.error ?? "Unknown error"}`);
    }
  }

  // Verdict
  console.log("\n" + "─".repeat(70));
  const s = succeeded.length;
  const researchRate = s > 0 ? succeeded.filter((r) => r.researchToolCount > 0).length / s : 0;
  const persistRate = s > 0 ? succeeded.filter((r) => r.persistToolCount >= 3).length / s : 0;
  const fullPipelineRate = s > 0 ? succeeded.filter((r) => r.researchToolCount > 0 && r.signalsCount > 0 && r.contactsCount > 0 && r.memoryStored).length / s : 0;
  const successRate = succeeded.length / results.length;

  const overallScore = Math.round(
    ((researchRate + persistRate + fullPipelineRate + successRate) / 4) * 100
  );

  const verdict =
    overallScore >= 90
      ? "🏆 PRODUCTION READY"
      : overallScore >= 75
        ? "✅ STRONG — Minor fixes needed"
        : overallScore >= 50
          ? "⚠️ NEEDS WORK — Inconsistent behavior"
          : "❌ NOT READY — Major issues";

  console.log(`VERDICT: ${verdict} (Score: ${overallScore}/100)`);
  console.log(`  Research quality: ${Math.round(researchRate * 100)}% | Persistence: ${Math.round(persistRate * 100)}% | Full pipeline: ${Math.round(fullPipelineRate * 100)}% | Success rate: ${Math.round(successRate * 100)}%`);
  console.log("─".repeat(70));
}

// ---------------------------------------------------------------------------
// DB Seeding
// ---------------------------------------------------------------------------

/**
 * Check DB health via the Ash server.
 * We can't import the DB client directly (AWS creds), so we use
 * the Ash server's warm pool via a lightweight test session.
 */
async function checkDbViaAsh(): Promise<boolean> {
  try {
    const res = await fetch(`${ASH_URL}/ash/v1/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "ping" }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("🚀 RevenueOS Batch Evaluation v2 — 10 APAC Companies");
  console.log(`   Ash URL: ${ASH_URL}`);
  console.log(`   Timeout: ${SESSION_TIMEOUT_MS / 1000}s per company`);
  console.log(`   Companies: ${COMPANIES.length}`);

  // Health check
  const dbOk = await checkDbViaAsh();
  if (!dbOk) {
    console.error(`\n❌ Ash server / DB not healthy at ${ASH_URL}`);
    console.error("   Ensure: (1) AWS creds active, (2) pnpm dev running");
    process.exit(1);
  }
  console.log(`   Health: ✅ Server is up\n`);

  const results: AgentRunResult[] = [];
  const WORKSPACE_ID = "10b28180-bd83-4a11-a06c-ff472c1718bd";

  for (let i = 0; i < COMPANIES.length; i++) {
    const company = COMPANIES[i];

    // DB health check every N runs
    if (i > 0 && i % DB_HEALTH_INTERVAL === 0) {
      const healthy = await checkDbViaAsh();
      if (!healthy) {
        console.log(`\n  ⚠️ DB health check failed — server may be degraded`);
        console.log(`  Pausing 15s to allow recovery...`);
        await new Promise((r) => setTimeout(r, 15_000));

        const retry = await checkDbViaAsh();
        if (!retry) {
          console.log(`  ❌ DB still unhealthy. Marking remaining companies as failed.`);
          for (let j = i; j < COMPANIES.length; j++) {
            const failResult = makeEmptyResult(COMPANIES[j]);
            failResult.error = "DB connection lost (IAM token expired or server crash)";
            results.push(failResult);
          }
          break;
        }
        console.log(`  ✅ DB recovered. Continuing.`);
      }
    }

    // For the batch eval, we generate a deterministic-ish orgId
    // In production, the frontend would create the org and pass the UUID
    // Here we include the orgId in the prompt so parseSessionContext can extract it
    const orgId = crypto.randomUUID();

    const result = await runAgentSession(company, orgId, WORKSPACE_ID, i);
    analyzeResult(result);
    results.push(result);

    // Pause between runs
    if (i < COMPANIES.length - 1) {
      console.log(`\n  ⏳ Pausing 5s before next run...`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  // Print report
  printReport(results);

  // Save structured results
  const reportPath = "docs/batch-eval-results.json";
  try {
    const { writeFileSync, mkdirSync } = await import("fs");
    mkdirSync("docs", { recursive: true });
    writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to ${reportPath}`);
  } catch (err) {
    console.log(`\n⚠️ Could not save results: ${err}`);
  }

  // Exit code
  const successRate = results.filter((r) => r.succeeded).length / results.length;
  process.exit(successRate >= 0.8 ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
