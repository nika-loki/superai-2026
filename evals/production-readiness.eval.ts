/**
 * RevenueOS — Production Readiness Eval Suite
 *
 * Tests the full account research agent against 6 production criteria:
 * 1. Dynamic planning — agent adapts behavior to account stage
 * 2. Plan before execute — loads context before research tools
 * 3. Company + person research — comprehensive coverage
 * 4. Signal creation — proper structure and source attribution
 * 5. Task creation — actionable engagement tasks with rationale
 * 6. Early exit — detects recent runs and avoids wasting tokens
 */

import {
  defineEvalSuite,
  type AshEvalScorer,
  type AshEvalScorerArgs,
} from "experimental-ash/evals";
import { Run, Text, Autoevals } from "experimental-ash/evals/scores";
import { Braintrust } from "experimental-ash/evals/reporters";

// ---------------------------------------------------------------------------
// Custom Scorers
// ---------------------------------------------------------------------------

/**
 * Checks that planning tools (db_get_org, honcho_recall) are called
 * BEFORE any research tools (exa_*). Returns 1 if correct order, 0 if not.
 * Returns null if no research tools were called (nothing to compare).
 */
function planBeforeExecute(): AshEvalScorer {
  return (args: AshEvalScorerArgs) => {
    const toolCalls = args.result.derived.toolCalls;

    const planToolIndices = [
      toolCalls.indexOf("db_get_org"),
      toolCalls.indexOf("honcho_recall"),
    ].filter((i) => i !== -1);

    const researchToolIndices = toolCalls
      .map((t, i) => (t.startsWith("exa_") ? i : -1))
      .filter((i) => i !== -1);

    // No research tools used — can't judge order, skip
    if (researchToolIndices.length === 0) {
      return { name: "planBeforeExecute", score: null };
    }

    // No planning tools used — fail
    if (planToolIndices.length === 0) {
      return {
        name: "planBeforeExecute",
        score: 0,
        metadata: { reason: "No planning tools called before research", toolCalls },
      };
    }

    const earliestPlanTool = Math.min(...planToolIndices);
    const earliestResearchTool = Math.min(...researchToolIndices);

    return {
      name: "planBeforeExecute",
      score: earliestPlanTool < earliestResearchTool ? 1 : 0,
      metadata: {
        earliestPlanTool: toolCalls[earliestPlanTool],
        earliestResearchTool: toolCalls[earliestResearchTool],
        planIndex: earliestPlanTool,
        researchIndex: earliestResearchTool,
        toolCalls,
      },
    };
  };
}

/**
 * Checks that the agent used BOTH company research AND people research tools.
 * Returns 1 if both used, 0.5 if only one, 0 if neither.
 */
function usedBothResearchTypes(): AshEvalScorer {
  return (args: AshEvalScorerArgs) => {
    const toolCalls = args.result.derived.toolCalls;
    const hasCompanyResearch = toolCalls.some(
      (t) => t === "exa_company_deep_dive" || t === "exa_agentic_research",
    );
    const hasPeopleResearch = toolCalls.some(
      (t) => t === "exa_people_search" || t === "exa_person_deep_dive",
    );

    let score = 0;
    if (hasCompanyResearch && hasPeopleResearch) score = 1;
    else if (hasCompanyResearch || hasPeopleResearch) score = 0.5;

    return {
      name: "usedBothResearchTypes",
      score,
      metadata: { hasCompanyResearch, hasPeopleResearch, toolCalls },
    };
  };
}

/**
 * Checks that the agent persisted all expected data types (signals, contacts, tasks).
 * Partial credit: 0.33 per data type persisted.
 */
function persistedAllDataTypes(): AshEvalScorer {
  return (args: AshEvalScorerArgs) => {
    const toolCalls = args.result.derived.toolCalls;
    const hasSignals = toolCalls.includes("db_write_signals");
    const hasContacts = toolCalls.includes("db_write_contacts");
    const hasTasks = toolCalls.includes("db_write_tasks");
    const hasResearchLog = toolCalls.includes("db_write_research_log");

    const score =
      (Number(hasSignals) + Number(hasContacts) + Number(hasTasks) + Number(hasResearchLog)) / 4;

    return {
      name: "persistedAllDataTypes",
      score,
      metadata: { hasSignals, hasContacts, hasTasks, hasResearchLog, toolCalls },
    };
  };
}

/**
 * Checks that the agent wrote memory at the end of the session.
 */
function storedMemory(): AshEvalScorer {
  return (args: AshEvalScorerArgs) => {
    const hasMemory = args.result.derived.toolCalls.includes("honcho_remember");
    return {
      name: "storedMemory",
      score: hasMemory ? 1 : 0,
      metadata: { toolCalls: args.result.derived.toolCalls },
    };
  };
}

// ---------------------------------------------------------------------------
// Eval Suite
// ---------------------------------------------------------------------------

export default defineEvalSuite({
  model: "openai/gpt-4.1-mini",
  description:
    "Production readiness for the RevenueOS agent. Tests 6 criteria: " +
    "dynamic planning, plan-before-execute, company+person research, " +
    "signal creation, task creation, and early-exit for recent runs.",

  cases: [
    // ── Criterion 1 & 2: Dynamic Planning + Plan Before Execute ──────
    {
      id: "full-research-new-account",
      input:
        "Research Grab (grab.com) as a new target account. This is a first-run — " +
        "no prior research exists. Start by understanding the account, then perform " +
        "comprehensive company and people research. Detect signals, find key contacts, " +
        "create engagement tasks, and store your findings for next time.",
      tags: ["planning", "full-research", "grab"],
      metadata: { criterion: "dynamic-planning", market: "Singapore" },
    },

    // ── Criterion 3: Company + Person Research ────────────────────────
    {
      id: "company-and-people-research",
      input:
        "Perform a deep research run on Sea Group (seagroup.com). I need both: " +
        "(1) Company intelligence — funding, expansion, leadership, product launches. " +
        "(2) Key decision-makers — find VP+ level contacts in engineering, partnerships, " +
        "and product. Profile each person's role, seniority, and relevance.",
      tags: ["company-research", "people-research", "sea-group"],
      metadata: { criterion: "comprehensive-research", market: "Singapore" },
    },

    // ── Criterion 4: Signal Creation with Attribution ─────────────────
    {
      id: "signal-creation-attribution",
      input:
        "Research Tokopedia (tokopedia.com) for buying signals. Focus on: " +
        "recent expansion into financial services, new product launches, leadership changes, " +
        "and funding activity. For each signal, include direct quotes from sources, " +
        "source URLs with titles, and ICP relevance explanations. Persist all signals.",
      tags: ["signals", "attribution", "tokopedia"],
      metadata: { criterion: "signal-creation", market: "Indonesia" },
    },

    // ── Criterion 5: Task Creation ────────────────────────────────────
    {
      id: "task-creation-quality",
      input:
        "Research Gojek (gojek.com) and create outreach engagement tasks. " +
        "Each task should include: what action to take, which contact to reach, " +
        "why now (rationale based on detected signals), and priority level. " +
        "Focus on B2B payments infrastructure decision-makers.",
      tags: ["tasks", "outreach", "gojek"],
      metadata: { criterion: "task-creation", market: "Indonesia" },
    },

    // ── Criterion 5b: Task + Signal end-to-end ────────────────────────
    {
      id: "signal-to-task-pipeline",
      input:
        "Canva (canva.com) recently launched an enterprise product and is expanding " +
        "into APAC markets. Research this, detect relevant signals, and convert " +
        "high-impact signals into actionable engagement tasks with specific contacts.",
      tags: ["pipeline", "signals-to-tasks", "canva"],
      metadata: { criterion: "signal-to-task", market: "Australia" },
    },

    // ── Criterion 6: Early Exit for Recent Run ────────────────────────
    {
      id: "early-exit-recent-run",
      input:
        "Research Grab (grab.com). IMPORTANT CONTEXT: The last research run completed " +
        "just 15 minutes ago. The account already has comprehensive signals, contacts, " +
        "and tasks from that run. Check the current state and memory before deciding " +
        "whether a full research cycle is needed. Be efficient with tokens.",
      tags: ["early-exit", "efficiency", "grab"],
      metadata: { criterion: "early-exit" },
    },
  ],

  scores: [
    // ── Universal: Agent must not crash ─────────────────────────────
    Run.didNotFail(),

    // ── Criterion 2: Plan before execute ────────────────────────────
    planBeforeExecute(),

    // ── Criterion 1: Dynamic planning (uses context tools) ──────────
    Run.usedTool("db_get_org"),
    Run.usedTool("honcho_recall"),

    // ── Criterion 3: Uses both company AND people research ──────────
    usedBothResearchTypes(),

    // ── Criterion 4: Creates signals ────────────────────────────────
    Run.usedTool("db_write_signals"),

    // ── Criterion 5: Creates tasks ──────────────────────────────────
    Run.usedTool("db_write_tasks"),

    // ── Criterion 4+5: Persists all data types ──────────────────────
    persistedAllDataTypes(),

    // ── Memory: Stores findings for next run ────────────────────────
    storedMemory(),

    // ── APAC context awareness ──────────────────────────────────────
    Text.includes("APAC"),

    // ── Criterion 4: Signal quality (LLM-judged) ───────────────────
    Autoevals.closedQA({
      criteria:
        "The response MUST demonstrate: " +
        "(1) Detection of specific buying signals (funding, expansion, leadership, product, regulatory). " +
        "(2) Each signal backed by direct quotes and source URLs. " +
        "(3) ICP relevance explanation — WHY this signal matters for a B2B sales intelligence platform targeting APAC companies. " +
        "(4) Impact assessment (how important is this signal). " +
        "Generic or non-specific answers should score low. " +
        "Hallucinated or unsourced claims should score 0.",
    }),

    // ── Criterion 5: Task quality (LLM-judged) ─────────────────────
    Autoevals.closedQA({
      criteria:
        "The response MUST include actionable engagement tasks that: " +
        "(1) Specify the action type (email, LinkedIn DM, call, research deeper). " +
        "(2) Identify a specific contact or role to engage. " +
        "(3) Include a timing rationale — why NOW is the right time based on detected signals. " +
        "(4) Have a priority level with justification. " +
        "Tasks without specific contacts, timing rationale, or signal-backed reasoning should score low.",
    }),

    // ── Factuality: Are claims grounded in real data? ───────────────
    Autoevals.factuality(),
  ],

  thresholds: {
    // Agent must complete without errors
    "run.didNotFail": 1.0,

    // Planning tools used
    "run.usedTool(db_get_org)": 0.8,
    "run.usedTool(honcho_recall)": 0.6,

    // Plan before execute (lower threshold — may fail in eval env without metadata)
    planBeforeExecute: 0.6,

    // Both research types used
    usedBothResearchTypes: 0.6,

    // Signal + task creation
    "run.usedTool(db_write_signals)": 0.6,
    "run.usedTool(db_write_tasks)": 0.5,

    // Persists all data types
    persistedAllDataTypes: 0.5,

    // Memory storage
    storedMemory: 0.6,

    // APAC context
    "text.includes": 0.6,

    // LLM-judged quality
    "autoevals.closedQA": 0.4,
    "autoevals.factuality": 0.5,
  },

  reporters: [
    Braintrust({
      projectName: "SalesDuo",
    }),
  ],

  maxConcurrency: 2,
  timeoutMs: 180_000,
});
