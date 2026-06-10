/**
 * RevenueOS — exa-people-search tool
 *
 * Searches for contacts at a target company via LinkedIn profiles and news.
 * Uses exaFindPeople() from the Exa client (neural search + LinkedIn category).
 */

import { defineTool } from "experimental-ash/tools";
import { z } from "zod";
import { exaFindPeople } from "../lib/exa";

export default defineTool({
  description:
    "Search for people at a target company via LinkedIn profiles. " +
    "Returns name, title, LinkedIn URL, and a brief summary for each result. " +
    "Optionally filter by job titles and country. " +
    "Automatically filters to profiles updated within the last 60 days.",
  inputSchema: z.object({
    companyName: z
      .string()
      .describe("The company to search for employees at"),
    titles: z
      .array(z.string())
      .optional()
      .describe("Job titles to filter by (e.g. ['CTO', 'VP Engineering'])"),
    country: z
      .string()
      .optional()
      .describe("Country to narrow results (e.g. 'Singapore', 'Japan')"),
    numResults: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("Number of results to return (1-50, default 10)"),
  }),
  async execute(input) {
    try {
      console.log(
        `[exa-people-search] Searching for people at "${input.companyName}"` +
          (input.titles ? ` with titles: ${input.titles.join(", ")}` : "") +
          (input.country ? ` in ${input.country}` : ""),
      );

      const response = await exaFindPeople({
        companyName: input.companyName,
        titles: input.titles,
        country: input.country,
        numResults: input.numResults,
        startPublishedDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      });

      if (response.results.length === 0) {
        return `No people found at "${input.companyName}". Try broadening the search criteria.`;
      }

      const lines = response.results.map((r, i) => {
        const parts = [`\n${i + 1}. ${r.title || "Unknown"}`];
        parts.push(`   URL: ${r.url}`);
        if (r.author) parts.push(`   Author: ${r.author}`);
        if (r.publishedDate)
          parts.push(`   Published: ${r.publishedDate}`);
        if (r.text) {
          const snippet = r.text.slice(0, 300);
          parts.push(`   Summary: ${snippet}${r.text.length > 300 ? "..." : ""}`);
        }
        if (r.highlights && r.highlights.length > 0) {
          parts.push(`   Highlights: ${r.highlights.slice(0, 3).join(" | ")}`);
        }
        return parts.join("\n");
      });

      const header = `Found ${response.results.length} people at "${input.companyName}":`;
      return header + lines.join("");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[exa-people-search] Error:", message);
      return `Error searching for people at "${input.companyName}": ${message}`;
    }
  },
  // Compact summary for the model — full profiles go to channels/frontend.
  toModelOutput(output: string) {
    if (output.startsWith("Error") || output.startsWith("No people")) {
      return { type: "text" as const, value: output };
    }
    const countMatch = output.match(/Found (\d+) people/);
    const count = countMatch ? countMatch[1] : "unknown";
    // Extract company name from header line
    const companyMatch = output.match(/at "(.+?)"/);
    const company = companyMatch ? companyMatch[1] : "the company";
    // Extract just names and titles for the model
    const names = [...output.matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1]).slice(0, 8);
    return {
      type: "text" as const,
      value: `People search complete: ${count} results at "${company}".\nContacts: ${names.join("; ")}\n\nUse db_write_contacts to persist the most relevant contacts.`,
    };
  },
});
