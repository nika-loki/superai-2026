/**
 * RevenueOS — Signal Quality & Source Attribution Suite
 *
 * Tests the agent's ability to:
 * - Produce signals with proper source attribution (quotes + URLs)
 * - Explain ICP relevance of detected signals
 * - Distinguish between high and low relevance signals
 * - Follow the "no signal without sources" rule
 */

import { defineEvalSuite } from "experimental-ash/evals";
import { Run, Autoevals } from "experimental-ash/evals/scores";
import { Braintrust } from "experimental-ash/evals/reporters";

export default defineEvalSuite({
  model: "openai/gpt-4.1-mini",
  description:
    "Evaluates signal detection quality — proper source attribution, ICP relevance, " +
    "and the ability to distinguish high-impact signals from noise.",
  task: {
    prompt: (testCase) =>
      `You are evaluating a sales intelligence agent. The agent was asked to research a target account.\n\n` +
      `Research request: ${String(testCase.input)}\n\n` +
      `Evaluate whether the agent's response includes:\n` +
      `1. Specific signals with direct quotes from sources\n` +
      `2. Source URLs with titles\n` +
      `3. ICP relevance explanations for each signal\n` +
      `4. Impact assessment\n\n` +
      `Respond with your analysis.`,
  },
  cases: [
    {
      id: "funding-signal-attribution",
      input:
        "SeaMoney raised $500M Series C extension. Research this and produce signals with " +
        "proper source attribution — quotes, URLs, and ICP relevance.",
      tags: ["funding", "attribution"],
    },
    {
      id: "expansion-signal-attribution",
      input:
        "GoTo Financial acquired a Philippines payments company for $200M. What signals does " +
        "this create? Include direct quotes and sources.",
      tags: ["expansion", "attribution"],
    },
    {
      id: "leadership-signal-attribution",
      input:
        "Grab hired an ex-Stripe executive to lead enterprise partnerships. Detect this signal " +
        "and explain why it matters for a payments infrastructure seller. Cite your sources.",
      tags: ["leadership", "attribution"],
    },
    {
      id: "regulatory-signal-attribution",
      input:
        "Singapore MAS issued new digital payment token licensing requirements. How does this " +
        "affect Grab and what signals does it create? Back everything with sources.",
      tags: ["regulatory", "attribution"],
    },
  ],
  scores: [
    Run.didNotFail(),

    // Must use Exa tools for research (not hallucinate)
    Run.usedTool("exa_company_deep_dive"),

    // Must persist signals to DB
    Run.usedTool("db_write_signals"),

    // LLM-judged: does the response include proper source attribution?
    Autoevals.closedQA({
      criteria:
        "The response MUST include: " +
        "(1) Direct quotes from sources — not paraphrased, actual quoted text. " +
        "(2) Source URLs or clear source references with titles. " +
        "(3) ICP relevance explanation — WHY this signal matters for the seller's product. " +
        "A response without all three should score 0. " +
        "Responses that hallucinate sources should score 0.",
    }),

    // LLM-judged: signal quality — are these meaningful buying signals?
    Autoevals.factuality(),
  ],
  thresholds: {
    "run.didNotFail": 1,
    "run.usedTool(exa_company_deep_dive)": 0.75,
    "run.usedTool(db_write_signals)": 0.5,
    "autoevals.closedQA": 0.5,
    "autoevals.factuality": 0.6,
  },
  reporters: [
    Braintrust({
      projectName: "SalesDuo",
    }),
  ],
  maxConcurrency: 2,
  timeoutMs: 120_000,
});
