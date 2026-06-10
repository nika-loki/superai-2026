/**
 * RevenueOS — End-to-End Agent Test Harness
 *
 * Runs a real agent session via Ash API (same path as the frontend),
 * captures the full NDJSON event trace, and produces a structured report
 * with tool-level timing, errors, and production-readiness scoring.
 *
 * Usage:
 *   npx tsx scripts/e2e-agent-test.ts [org-id]
 *
 * If no org-id is provided, picks the first org from the DB.
 */

// ── Config ────────────────────────────────────────────────────────────

const ASH_URL = process.env.ASH_URL ?? "http://127.0.0.1:3000";
const SESSION_TIMEOUT_MS = 300_000; // 5 minutes — subagent delegation needs more time

// ── Types ─────────────────────────────────────────────────────────────

interface AshEvent {
  type: string;
  data?: Record<string, unknown>;
  meta?: { at: string };
}

interface ToolCall {
  callId: string;
  toolName: string;
  status: "running" | "completed" | "failed";
  input?: string;
  output?: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
}

interface TraceResult {
  sessionId: string;
  succeeded: boolean;
  events: AshEvent[];
  toolCalls: ToolCall[];
  finalMessage: string;
  totalDurationMs: number;
  error?: string;
  scores: Record<string, { score: number | null; metadata?: Record<string, unknown> }>;
}

// ── Ash API Client ────────────────────────────────────────────────────

async function runAgentSession(message: string, orgId?: string): Promise<TraceResult> {
  const startTime = Date.now();

  // 1. Create session
  console.log("\n🔄 Creating Ash session...");
  const res = await fetch(`${ASH_URL}/ash/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message,
      ...(orgId ? { clientContext: { orgId } } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return {
      sessionId: "",
      succeeded: false,
      events: [],
      toolCalls: [],
      finalMessage: "",
      totalDurationMs: Date.now() - startTime,
      error: `Session creation failed (${res.status}): ${body.slice(0, 500)}`,
      scores: {},
    };
  }

  const session = (await res.json()) as { sessionId: string };
  console.log(`   Session: ${session.sessionId}`);

  // 2. Stream events
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);

  const events: AshEvent[] = [];
  const toolCallMap = new Map<string, ToolCall>();
  let finalMessage = "";
  let succeeded = true;

  try {
    const streamRes = await fetch(
      `${ASH_URL}/ash/v1/session/${session.sessionId}/stream`,
      { signal: controller.signal },
    );

    if (!streamRes.ok || !streamRes.body) {
      return {
        sessionId: session.sessionId,
        succeeded: false,
        events: [],
        toolCalls: [],
        finalMessage: "",
        totalDurationMs: Date.now() - startTime,
        error: `Stream failed (${streamRes.status})`,
        scores: {},
      };
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
          events.push(event);
          processEvent(event, toolCallMap);

          // Live progress indicator
          if (event.type === "actions.requested") {
            const actions = event.data?.actions as Array<{ toolName?: string; name?: string }> | undefined;
            if (actions) {
              for (const a of actions) {
                const name = a.toolName ?? a.name ?? "subagent";
                process.stdout.write(`   🔧 ${name}...`);
              }
            }
          }
          if (event.type === "action.result") {
            const result = event.data?.result as { callId?: string; kind?: string } | undefined;
            const status = event.data?.status as string | undefined;
            if (result?.kind === "tool-result") {
              const tc = toolCallMap.get(result.callId ?? "");
              process.stdout.write(` ${status === "error" ? "❌" : "✅"}${tc ? ` (${tc.durationMs ?? "?"}ms)` : ""}\n`);
            }
          }
          if (event.type === "message.completed") {
            const msg = event.data?.message as string | undefined;
            if (msg) finalMessage = msg;
          }
          if (event.type === "session.failed") {
            succeeded = false;
            console.log("\n   ❌ Session failed!");
          }
          if (event.type === "session.waiting" || event.type === "session.completed") {
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
      succeeded = events.some(
        (e) => e.type === "session.waiting" || e.type === "session.completed",
      );
      if (!succeeded) console.log("\n   ⏱️ Session timed out");
    } else {
      succeeded = false;
    }
  } finally {
    clearTimeout(timer);
  }

  const toolCalls = Array.from(toolCallMap.values());
  const totalDurationMs = Date.now() - startTime;

  // Score the run
  const scores = scoreRun(toolCalls, finalMessage, succeeded);

  return {
    sessionId: session.sessionId,
    succeeded,
    events,
    toolCalls,
    finalMessage,
    totalDurationMs,
    scores,
  };
}

function processEvent(event: AshEvent, toolCallMap: Map<string, ToolCall>) {
  if (event.type === "actions.requested") {
    const actions = event.data?.actions as
      | Array<{ callId?: string; toolName?: string; name?: string; input?: unknown; kind?: string }>
      | undefined;
    if (actions) {
      for (const a of actions) {
        const name = a.toolName ?? a.name ?? "";
        if (name && (a.kind === "tool-call" || a.kind === undefined)) {
          toolCallMap.set(a.callId ?? name, {
            callId: a.callId ?? name,
            toolName: name,
            status: "running",
            input: typeof a.input === "string" ? a.input.slice(0, 500) : JSON.stringify(a.input)?.slice(0, 500),
            startedAt: Date.now(),
          });
        }
      }
    }
  }

  if (event.type === "action.result") {
    const result = event.data?.result as
      | { callId?: string; kind?: string; output?: unknown }
      | undefined;
    const status = event.data?.status as string | undefined;
    if (result?.kind === "tool-result" && result.callId) {
      const tc = toolCallMap.get(result.callId);
      if (tc) {
        const now = Date.now();
        tc.status = status === "error" ? "failed" : "completed";
        tc.output = typeof result.output === "string"
          ? result.output.slice(0, 500)
          : JSON.stringify(result.output)?.slice(0, 500);
        tc.completedAt = now;
        tc.durationMs = now - tc.startedAt;
        if (status === "error") {
          tc.error = tc.output;
        }
      }
    }
  }
}

// ── Scorers ───────────────────────────────────────────────────────────

function scoreRun(
  toolCalls: ToolCall[],
  message: string,
  succeeded: boolean,
): Record<string, { score: number | null; metadata?: Record<string, unknown> }> {
  const toolNames = toolCalls.map((t) => t.toolName.replace(/-/g, "_"));
  const has = (name: string) => toolNames.some((t) => t === name);
  const failedTools = toolCalls.filter((t) => t.status === "failed");
  const exaTools = toolNames.filter((t) => t.startsWith("exa_"));
  const dbWriteTools = toolNames.filter((t) => t.startsWith("db_write_"));

  // Plan before execute
  const planIdx = [toolNames.indexOf("db_get_org"), toolNames.indexOf("honcho_recall")]
    .filter((i) => i !== -1);
  const researchIdx = exaTools.length > 0
    ? toolNames.findIndex((t) => t.startsWith("exa_"))
    : -1;
  const planBeforeExecute = researchIdx === -1
    ? null
    : planIdx.length > 0 && Math.min(...planIdx) < researchIdx
      ? 1
      : 0;

  // Both research types
  const hasCompany = has("exa_company_deep_dive") || has("exa_agentic_research");
  const hasPeople = has("exa_people_search") || has("exa_person_deep_dive");
  const bothResearch = hasCompany && hasPeople ? 1 : hasCompany || hasPeople ? 0.5 : 0;

  // Data persistence
  const hasSignals = has("db_write_signals");
  const hasContacts = has("db_write_contacts");
  const hasTasks = has("db_write_tasks");
  const hasLog = has("db_write_research_log");
  const persistenceScore =
    (Number(hasSignals) + Number(hasContacts) + Number(hasTasks) + Number(hasLog)) / 4;

  return {
    agent_succeeded: { score: succeeded ? 1 : 0 },
    plan_before_execute: {
      score: planBeforeExecute,
      metadata: { toolOrder: toolNames },
    },
    used_db_get_org: { score: has("db_get_org") ? 1 : 0 },
    used_honcho_recall: { score: has("honcho_recall") ? 1 : 0 },
    both_research_types: {
      score: bothResearch,
      metadata: { hasCompany, hasPeople },
    },
    used_exa_tools: {
      score: exaTools.length > 0 ? 1 : 0,
      metadata: { exaTools },
    },
    persisted_data: {
      score: persistenceScore,
      metadata: { hasSignals, hasContacts, hasTasks, hasLog },
    },
    stored_memory: { score: has("honcho_remember") ? 1 : 0 },
    no_tool_errors: {
      score: failedTools.length === 0 ? 1 : failedTools.length <= 1 ? 0.5 : 0,
      metadata: {
        failedTools: failedTools.map((t) => ({
          name: t.toolName,
          error: t.error?.slice(0, 200),
        })),
      },
    },
    has_output: { score: message.length > 50 ? 1 : message.length > 0 ? 0.5 : 0 },
  };
}

// ── Report ────────────────────────────────────────────────────────────

function printReport(result: TraceResult) {
  console.log("\n" + "═".repeat(72));
  console.log("  REVENUEOS — E2E Agent Test Report");
  console.log("═".repeat(72));

  // Session info
  console.log("\n📋 Session");
  console.log(`   ID:        ${result.sessionId}`);
  console.log(`   Duration:  ${(result.totalDurationMs / 1000).toFixed(1)}s`);
  console.log(`   Status:    ${result.succeeded ? "✅ Succeeded" : "❌ Failed"}`);
  if (result.error) console.log(`   Error:     ${result.error}`);

  // Tool calls
  console.log(`\n🔧 Tool Calls (${result.toolCalls.length})`);
  if (result.toolCalls.length === 0) {
    console.log("   (none)");
  }
  for (const tc of result.toolCalls) {
    const status =
      tc.status === "completed" ? "✅" :
      tc.status === "failed" ? "❌" :
      "⏳";
    const dur = tc.durationMs ? `${(tc.durationMs / 1000).toFixed(1)}s` : "—";
    console.log(`   ${status} ${tc.toolName.padEnd(30)} ${dur.padStart(8)}`);
    if (tc.error) {
      console.log(`      Error: ${tc.error.slice(0, 150)}`);
    }
    if (tc.output && tc.status === "completed") {
      const preview = tc.output.slice(0, 120).replace(/\n/g, " ");
      console.log(`      Output: ${preview}${tc.output.length > 120 ? "..." : ""}`);
    }
  }

  // Scores
  console.log("\n📊 Production Readiness Scores");
  let totalScore = 0;
  let scoredCount = 0;
  for (const [name, { score, metadata }] of Object.entries(result.scores)) {
    if (score === null) continue;
    const bar = score >= 1 ? "✅" : score >= 0.5 ? "🟡" : "❌";
    console.log(`   ${bar} ${name.padEnd(25)} ${score.toFixed(2)}`);
    totalScore += score;
    scoredCount++;
  }
  const avgScore = scoredCount > 0 ? totalScore / scoredCount : 0;
  console.log(`\n   📈 Overall: ${(avgScore * 100).toFixed(0)}% production-ready`);

  // Issues
  const failedTools = result.toolCalls.filter((t) => t.status === "failed");
  if (failedTools.length > 0) {
    console.log("\n🚨 Issues Found");
    for (const tc of failedTools) {
      console.log(`   ❌ ${tc.toolName}: ${tc.error?.slice(0, 200) ?? "unknown error"}`);
    }
  }

  // Output preview
  if (result.finalMessage) {
    console.log("\n💬 Agent Output (first 300 chars)");
    console.log("   " + result.finalMessage.slice(0, 300).replace(/\n/g, "\n   "));
  }

  // Actionable recommendations
  console.log("\n🎯 Recommendations");
  const recs: string[] = [];
  if (!result.succeeded) recs.push("Agent session failed — check server logs");
  if (result.toolCalls.length === 0) recs.push("Agent made no tool calls — check instructions and model access");
  if (failedTools.length > 0) recs.push(`Fix ${failedTools.length} failing tool(s): ${failedTools.map((t) => t.toolName).join(", ")}`);
  if (!result.scores.plan_before_execute.score) recs.push("Agent didn't plan before executing — instructions should enforce db_get_org + honcho_recall first");
  if (!result.scores.both_research_types.score) recs.push("Agent didn't do both company + people research");
  if (result.scores.persisted_data.score !== null && result.scores.persisted_data.score < 1) recs.push("Agent didn't persist all data types (signals, contacts, tasks, log)");
  if (!result.scores.stored_memory.score) recs.push("Agent didn't store memory via honcho_remember");
  if (recs.length === 0) recs.push("All checks passed! ✅");
  for (const r of recs) console.log(`   • ${r}`);

  console.log("\n" + "═".repeat(72));

  return { avgScore, failedTools, recs };
}

// ── Main ──────────────────────────────────────────────────────────────

async function discoverFirstOrg(): Promise<{ id: string; name: string } | null> {
  // Try the Ash agent to list orgs — send a simple request
  const res = await fetch(`${ASH_URL}/ash/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "Call db_get_org with orgId __DISCOVER__. Just show me the raw result.",
    }),
  });
  // We can't actually discover this way — the tool requires a valid UUID.
  // Instead, try known IDs from the seed data.
  return null;
}

async function main() {
  let orgId = process.argv[2];

  // Auto-discover org if not provided
  if (!orgId) {
    // Try common seed IDs
    const candidateIds = [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
      "10000000-0000-4000-8000-000000000003",
      "10000000-0000-4000-8000-000000000004",
      "10000000-0000-4000-8000-000000000005",
    ];

    console.log("🔍 Auto-discovering org...");
    for (const id of candidateIds) {
      try {
        const res = await fetch(`${ASH_URL}/ash/v1/session`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: `Call db_get_org with orgId ${id} and tell me ONLY the org name. Nothing else.`,
          }),
        });
        if (!res.ok) continue;
        const session = (await res.json()) as { sessionId: string };

        // Quick stream to get result
        const streamRes = await fetch(`${ASH_URL}/ash/v1/session/${session.sessionId}/stream`);
        if (!streamRes.ok) continue;

        const reader = streamRes.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let foundOrg = false;

        outer:
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);
              if (event.type === "action.result") {
                const output = String(event.data?.result?.output ?? "");
                if (output && !output.includes("not found")) {
                  orgId = id;
                  console.log(`   Found org: ${output.slice(0, 60)}`);
                  foundOrg = true;
                  reader.cancel();
                  break outer;
                }
              }
              if (event.type === "session.waiting" || event.type === "session.completed") {
                reader.cancel();
                break outer;
              }
            } catch { /* skip */ }
          }
        }
        if (foundOrg) break;
      } catch {
        continue;
      }
    }
  }

  if (!orgId) {
    console.error("❌ No org ID provided and auto-discovery failed.");
    console.error("   Usage: npx tsx scripts/e2e-agent-test.ts <org-id>");
    process.exit(1);
  }

  const message = `Research this organisation thoroughly. The orgId is ${orgId}. Find buying signals, key contacts, and recommend next-best-actions. Use all available tools.`;

  console.log("\n🚀 RevenueOS E2E Agent Test");
  console.log(`   Message: ${message.slice(0, 100)}...`);
  console.log(`   OrgId:   ${orgId}`);

  const result = await runAgentSession(message, orgId);
  const report = printReport(result);

  // Exit code based on results
  if (!result.succeeded || report.failedTools.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
