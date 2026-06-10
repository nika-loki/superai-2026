/**
 * RevenueOS — Braintrust-Native Production Readiness Eval
 *
 * Runs against a live `pnpm dev` server. Each test case:
 * 1. Creates an Ash agent session via HTTP
 * 2. Sends a research prompt
 * 3. Streams events until completion
 * 4. Scores tool usage, output quality, and behavior patterns
 *
 * Usage:
 *   1. Start the dev server:  pnpm dev
 *   2. Run evals:             bt eval evals/agent-production.eval.ts
 */

import { Eval } from "braintrust";
import { Factuality } from "autoevals";

// ---------------------------------------------------------------------------
// Ash Agent HTTP Client
// ---------------------------------------------------------------------------

const ASH_URL = process.env.ASH_URL ?? "http://127.0.0.1:3000";

interface AshEvent {
  type: string;
  data?: Record<string, unknown>;
  meta?: { at: string };
}

interface AgentRunResult {
  /** Final text message from the agent */
  output: string;
  /** All stream events */
  events: AshEvent[];
  /** Tool calls made by the agent (ordered) */
  toolCalls: string[];
  /** Whether the agent completed without error */
  succeeded: boolean;
  /** Session ID */
  sessionId: string;
}

const SESSION_TIMEOUT_MS = 180_000;

/**
 * Send a message to the Ash agent and stream events until completion.
 * Uses Node.js http to properly handle streaming NDJSON.
 */
async function runAgentSession(message: string): Promise<AgentRunResult> {
  // 1. Create session
  const res = await fetch(`${ASH_URL}/ash/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const body = await res.text();
    return {
      output: `Session creation failed (${res.status}): ${body.slice(0, 500)}`,
      events: [],
      toolCalls: [],
      succeeded: false,
      sessionId: "",
    };
  }

  const session = (await res.json()) as {
    sessionId: string;
    continuationToken: string;
  };

  // 2. Stream events with timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);

  const events: AshEvent[] = [];
  const toolCalls: string[] = [];
  let finalMessage = "";
  let succeeded = true;
  let allMessageText = "";

  try {
    const streamRes = await fetch(
      `${ASH_URL}/ash/v1/session/${session.sessionId}/stream`,
      { signal: controller.signal },
    );

    if (!streamRes.ok || !streamRes.body) {
      return {
        output: `Stream failed (${streamRes.status})`,
        events: [],
        toolCalls: [],
        succeeded: false,
        sessionId: session.sessionId,
      };
    }

    // Read the NDJSON stream line by line
    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as AshEvent;
          events.push(event);

          // Track tool calls
          if (event.type === "actions.requested") {
            const actions = event.data?.actions as
              | Array<{ toolName: string; name?: string }>
              | undefined;
            if (actions) {
              for (const a of actions) {
                // Ash uses toolName with hyphens; normalize to underscore for scoring
                const name = (a.toolName ?? a.name ?? "").replace(/-/g, "_");
                if (name) toolCalls.push(name);
              }
            }
          }

          // Track final message content
          if (event.type === "message.completed") {
            const msg = event.data?.message as string | undefined;
            const content = event.data?.content as string | undefined;
            if (msg || content) finalMessage = String(msg ?? content);
          }

          // Also accumulate appended text as fallback
          if (event.type === "message.appended") {
            const soFar = event.data?.messageSoFar as string | undefined;
            if (soFar) allMessageText = soFar;
          }

          // Track failure
          if (event.type === "session.failed") {
            succeeded = false;
          }

          // Early exit on session.waiting or session.completed
          if (
            event.type === "session.waiting" ||
            event.type === "session.completed"
          ) {
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
      // Timeout — return what we have
      succeeded = events.some(
        (e) =>
          e.type === "session.waiting" || e.type === "session.completed",
      );
    } else {
      succeeded = false;
    }
  } finally {
    clearTimeout(timer);
  }

  // Use message.completed content if available, otherwise appended text
  const output = finalMessage || allMessageText || "";

  return { output, events, toolCalls, succeeded, sessionId: session.sessionId };
}

// ---------------------------------------------------------------------------
// Scorers
// ---------------------------------------------------------------------------

/** Agent completed without crashing */
function AgentSucceeded({ output }: { output: AgentRunResult }) {
  return {
    name: "agent_succeeded",
    score: output.succeeded ? 1 : 0,
  };
}

/** Agent called a specific tool */
function UsedTool(toolName: string) {
  return ({ output }: { output: AgentRunResult }) => ({
    name: `used_${toolName.replace(/-/g, "_")}`,
    score: output.toolCalls.includes(toolName) ? 1 : 0,
    metadata: { toolCalls: output.toolCalls },
  });
}

/** Planning tools called before research tools */
function PlanBeforeExecute({ output }: { output: AgentRunResult }) {
  const tc = output.toolCalls;
  const planIdx = [
    tc.indexOf("db_get_org"),
    tc.indexOf("honcho_recall"),
  ].filter((i) => i !== -1);
  const researchIdx = tc
    .map((t, i) => (t.startsWith("exa_") ? i : -1))
    .filter((i) => i !== -1);

  if (researchIdx.length === 0) return { name: "plan_before_execute", score: null };
  if (planIdx.length === 0) return { name: "plan_before_execute", score: 0 };

  return {
    name: "plan_before_execute",
    score: Math.min(...planIdx) < Math.min(...researchIdx) ? 1 : 0,
    metadata: { toolCalls: tc },
  };
}

/** Agent used both company and people research */
function UsedBothResearchTypes({ output }: { output: AgentRunResult }) {
  const hasCompany = output.toolCalls.some(
    (t) => t === "exa_company_deep_dive" || t === "exa_agentic_research",
  );
  const hasPeople = output.toolCalls.some(
    (t) => t === "exa_people_search" || t === "exa_person_deep_dive",
  );

  let score = 0;
  if (hasCompany && hasPeople) score = 1;
  else if (hasCompany || hasPeople) score = 0.5;

  return { name: "both_research_types", score, metadata: { hasCompany, hasPeople } };
}

/** Agent persisted all data types (signals, contacts, tasks) */
function PersistedAllData({ output }: { output: AgentRunResult }) {
  const tc = output.toolCalls;
  const hasSignals = tc.includes("db_write_signals");
  const hasContacts = tc.includes("db_write_contacts");
  const hasTasks = tc.includes("db_write_tasks");
  const hasLog = tc.includes("db_write_research_log");

  const score =
    (Number(hasSignals) + Number(hasContacts) + Number(hasTasks) + Number(hasLog)) / 4;

  return {
    name: "persisted_all_data",
    score,
    metadata: { hasSignals, hasContacts, hasTasks, hasLog },
  };
}

/** Agent stored memory */
function StoredMemory({ output }: { output: AgentRunResult }) {
  return {
    name: "stored_memory",
    score: output.toolCalls.includes("honcho_remember") ? 1 : 0,
  };
}

/** Early exit: agent should NOT use research tools for a recently-researched org */
function EarlyExitEfficient({ output }: { output: AgentRunResult }) {
  const researchTools = output.toolCalls.filter((t) => t.startsWith("exa_"));
  const isLightRun = researchTools.length === 0;
  const usedPlanningOnly =
    output.toolCalls.includes("db_get_org") &&
    output.toolCalls.length <= 4; // db_get_org, honcho_recall, honcho_remember, maybe db_update_org

  return {
    name: "early_exit_efficient",
    score: isLightRun && usedPlanningOnly ? 1 : isLightRun ? 0.5 : 0,
    metadata: {
      toolCalls: output.toolCalls,
      researchToolCount: researchTools.length,
    },
  };
}

/** LLM-judged output quality via Braintrust Factuality */
async function OutputQuality({
  output,
  expected,
}: {
  input: unknown;
  output: AgentRunResult;
  expected?: string;
}) {
  if (!output.output) return { name: "output_quality", score: 0 };

  const result = await Factuality({
    input: String(expected ?? "Sales intelligence research"),
    output: output.output,
  });

  return {
    name: "output_quality",
    score: result.score,
  };
}

// ---------------------------------------------------------------------------
// Test Cases
// ---------------------------------------------------------------------------

interface TestCase {
  input: string;
  expected: string;
  tags: string[];
  metadata: Record<string, string>;
}

const CASES: TestCase[] = [
  {
    input:
      "Research Grab (grab.com) as a new target account. This is a first-run — " +
      "no prior research exists. Start by understanding the account, then perform " +
      "comprehensive company and people research. Detect signals, find key contacts, " +
      "create engagement tasks, and store your findings for next time.",
    expected:
      "Full research report on Grab with signals, contacts, tasks, and memory storage",
    tags: ["planning", "full-research", "grab"],
    metadata: { criterion: "dynamic-planning", market: "Singapore" },
  },
  {
    input:
      "Perform a deep research run on Sea Group (seagroup.com). I need both: " +
      "(1) Company intelligence — funding, expansion, leadership, product launches. " +
      "(2) Key decision-makers — find VP+ level contacts in engineering, partnerships, " +
      "and product. Profile each person's role, seniority, and relevance.",
    expected:
      "Company intelligence with funding/expansion signals AND VP+ contact profiles for Sea Group",
    tags: ["company-research", "people-research", "sea-group"],
    metadata: { criterion: "comprehensive-research", market: "Singapore" },
  },
  {
    input:
      "Research Tokopedia (tokopedia.com) for buying signals. Focus on: " +
      "recent expansion into financial services, new product launches, leadership changes, " +
      "and funding activity. For each signal, include direct quotes from sources, " +
      "source URLs with titles, and ICP relevance explanations.",
    expected:
      "Multiple buying signals for Tokopedia with source attribution, quotes, URLs, and ICP relevance",
    tags: ["signals", "attribution", "tokopedia"],
    metadata: { criterion: "signal-creation", market: "Indonesia" },
  },
  {
    input:
      "Research Gojek (gojek.com) and create outreach engagement tasks. " +
      "Each task should include: what action to take, which contact to reach, " +
      "why now (rationale based on detected signals), and priority level.",
    expected:
      "Actionable outreach tasks for Gojek with specific contacts, timing rationale, and priorities",
    tags: ["tasks", "outreach", "gojek"],
    metadata: { criterion: "task-creation", market: "Indonesia" },
  },
  {
    input:
      "Canva (canva.com) recently launched an enterprise product and is expanding " +
      "into APAC markets. Research this, detect relevant signals, and convert " +
      "high-impact signals into actionable engagement tasks with specific contacts.",
    expected:
      "Signal-to-task pipeline: detected signals converted to engagement tasks for Canva",
    tags: ["pipeline", "signals-to-tasks", "canva"],
    metadata: { criterion: "signal-to-task", market: "Australia" },
  },
  {
    input:
      "Research Grab (grab.com). IMPORTANT: The last research run completed " +
      "just 15 minutes ago. The account already has comprehensive signals, contacts, " +
      "and tasks from that run. Check the current state and memory before deciding " +
      "whether a full research cycle is needed. Be efficient with tokens.",
    expected:
      "Agent acknowledges recent run, checks state, and decides not to do full research",
    tags: ["early-exit", "efficiency", "grab"],
    metadata: { criterion: "early-exit" },
  },
];

// ---------------------------------------------------------------------------
// Run Evals
// ---------------------------------------------------------------------------

await Eval("SalesDuo Agent", {
  data: () =>
    CASES.map((c) => ({
      input: c.input,
      expected: c.expected,
      tags: c.tags,
      metadata: c.metadata,
    })),
  task: async (input: string) => {
    return await runAgentSession(input);
  },
  scores: [
    AgentSucceeded,
    PlanBeforeExecute,
    UsedTool("db_get_org"),
    UsedTool("honcho_recall"),
    UsedBothResearchTypes,
    UsedTool("db_write_signals"),
    UsedTool("db_write_tasks"),
    PersistedAllData,
    StoredMemory,
    EarlyExitEfficient,
    OutputQuality,
  ],
  maxConcurrency: 1,
  timeout: 180_000,
  experimentName: "production-readiness",
});
