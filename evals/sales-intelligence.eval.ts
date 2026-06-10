/**
 * RevenueOS — Sales Intelligence Smoke Suite
 *
 * Tests the agent's core sales capabilities:
 * - Account research initiation
 * - Tool usage patterns (Exa search, DB writes)
 * - ICP scoring and signal detection
 * - Contact discovery
 * - Next-best-action generation
 */

import { defineEvalSuite } from "experimental-ash/evals";
import { Run, Text, Autoevals } from "experimental-ash/evals/scores";
import { Braintrust } from "experimental-ash/evals/reporters";

export default defineEvalSuite({
  model: "openai/gpt-4.1-mini",
  description:
    "Smoke tests for the RevenueOS sales agent — verifies it can research a target account, " +
    "use the right tools, detect signals, discover contacts, and recommend actions.",
  cases: [
    {
      id: "research-initiation",
      input:
        "I need you to research Grab (grab.com) as a target account. They're a Singapore-based " +
        "super-app expanding into B2B payments via GrabFin. Find key contacts and signals.",
      tags: ["research", "grab"],
      metadata: { org_domain: "grab.com", market: "Singapore" },
    },
    {
      id: "signal-detection-funding",
      input:
        "Research Sea Group (seagroup.com). They just raised $500M for SeaMoney digital lending. " +
        "What signals do you detect and how relevant are they for a payments infrastructure seller?",
      tags: ["signals", "sea-group"],
      metadata: { org_domain: "seagroup.com", signal_type: "funding" },
    },
    {
      id: "contact-discovery",
      input:
        "Find key decision-makers at Gojek (gojek.com) who would be involved in B2B payment " +
        "infrastructure decisions. I need VP+ level contacts in engineering, partnerships, and product.",
      tags: ["contacts", "gojek"],
      metadata: { org_domain: "gojek.com", focus: "contacts" },
    },
    {
      id: "icp-scoring",
      input:
        "Evaluate Canva (canva.com) against this ICP: B2B payments infrastructure company targeting " +
        "APAC fintech companies with 500+ employees and Series B+ funding. Score them and explain why.",
      tags: ["scoring", "canva"],
      metadata: { org_domain: "canva.com", focus: "icp_scoring" },
    },
    {
      id: "next-best-action",
      input:
        "Tokopedia just launched Tokopedia Pay QR for Indonesian SMEs and is migrating to microservices. " +
        "What outreach actions would you recommend and why? Include specific contacts and timing rationale.",
      tags: ["actions", "tokopedia"],
      metadata: { org_domain: "tokopedia.com", focus: "next_best_action" },
    },
  ],
  scores: [
    // Agent must complete without errors
    Run.didNotFail(),

    // Agent must use Exa search tools for research
    Run.usedTool("exa_company_deep_dive"),

    // Agent should use DB write tools to persist findings
    Run.usedTool("db_write_signals"),

    // Agent must store memory for next run
    Run.usedTool("honcho_remember"),

    // Output should mention APAC-specific context
    Text.includes("APAC"),

    // LLM-judged: does the response demonstrate sales intelligence?
    Autoevals.closedQA({
      criteria:
        "The response must demonstrate sales intelligence by: " +
        "(1) identifying relevant buying signals from the target company, " +
        "(2) explaining ICP fit with specific reasoning, " +
        "(3) recommending concrete next steps with timing rationale. " +
        "Generic or non-specific answers should score low.",
    }),
  ],
  thresholds: {
    "run.didNotFail": 1,
    "run.usedTool(exa_company_deep_dive)": 0.6,
    "run.usedTool(db_write_signals)": 0.4,
    "run.usedTool(honcho_remember)": 0.4,
    "text.includes": 0.8,
    "autoevals.closedQA": 0.6,
  },
  reporters: [
    Braintrust({
      projectName: "SalesDuo",
    }),
  ],
  maxConcurrency: 3,
  timeoutMs: 120_000,
});
