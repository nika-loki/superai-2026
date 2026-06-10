/**
 * RevenueOS — exa-answer tool
 *
 * Uses Exa's Answer API for direct Q&A with citations.
 * Good for targeted factual questions where a synthesized answer is needed.
 */

import { defineTool } from "experimental-ash/tools";
import { z } from "zod";
import { exaAnswer } from "../lib/exa";

export default defineTool({
  description:
    "Ask a direct question and get a synthesized answer with citations. " +
    "Use for targeted factual queries (e.g. 'What is Grab's latest funding round?'). " +
    "Returns the answer text plus source citations.",
  inputSchema: z.object({
    query: z.string().describe("The question to answer"),
    includeDomains: z
      .array(z.string())
      .optional()
      .describe("Restrict search to these domains (e.g. ['techcrunch.com', 'crunchbase.com'])"),
  }),
  async execute(input) {
    try {
      console.log(
        `[exa-answer] Query: "${input.query.slice(0, 80)}${input.query.length > 80 ? "..." : ""}"`,
      );

      const response = await exaAnswer(input.query, {
        includeDomains: input.includeDomains,
        searchDepth: "advanced",
      });

      const parts: string[] = [`Answer:\n${response.answer}`];

      if (response.citations.length > 0) {
        parts.push("\n\nSources:");
        for (let i = 0; i < response.citations.length; i++) {
          const c = response.citations[i]!;
          parts.push(
            `${i + 1}. ${c.title || "Untitled"}\n   ${c.url}` +
              (c.publishedDate ? `\n   Published: ${c.publishedDate}` : "") +
              (c.text ? `\n   Excerpt: ${c.text.slice(0, 200)}` : ""),
          );
        }
      }

      return parts.join("\n");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[exa-answer] Error:", message);
      return `Error answering query: ${message}`;
    }
  },
});
