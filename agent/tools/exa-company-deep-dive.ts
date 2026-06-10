/**
 * RevenueOS — exa-company-deep-dive tool
 *
 * Runs 8 parallel Exa searches across different intelligence angles
 * (funding, leadership, expansion, product, financials, regulatory, ICP, competitive).
 * Returns all findings grouped by angle.
 */

import { defineTool } from "experimental-ash/tools";
import { z } from "zod";
import { exaCompanyDeepDive } from "../lib/exa";

const ANGLE_LABELS = [
  "Funding & Investment",
  "Leadership Changes",
  "Expansion & Growth",
  "Product & Strategy",
  "Financial Reports",
  "Regulatory & Compliance",
  "ICP-Specific Signals",
  "Competitive Landscape",
] as const;

export default defineTool({
  description:
    "Deep-dive research on a company across 8 intelligence angles: " +
    "funding, leadership changes, expansion, product strategy, financials, " +
    "regulatory, ICP signals, and competitive landscape. " +
    "Runs 8 parallel searches and returns findings grouped by angle. " +
    "Automatically filters to results published within the last 60 days.",
  inputSchema: z.object({
    companyName: z.string().describe("The company to research"),
    domain: z
      .string()
      .optional()
      .describe("Company domain to restrict searches (e.g. 'grab.com')"),
  }),
  async execute(input) {
    try {
      console.log(
        `[exa-company-deep-dive] Starting deep dive on "${input.companyName}"` +
          (input.domain ? ` (domain: ${input.domain})` : ""),
      );

      const responses = await exaCompanyDeepDive({
        companyName: input.companyName,
        domain: input.domain,
        startPublishedDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const sections: string[] = [
        `Company Deep Dive: ${input.companyName}`,
        `=${"=".repeat(input.companyName.length + 18)}`,
        "",
      ];

      let totalResults = 0;

      for (let i = 0; i < responses.length; i++) {
        const angleLabel = ANGLE_LABELS[i] ?? `Angle ${i + 1}`;
        const response = responses[i]!;
        totalResults += response.results.length;

        sections.push(`\n## ${angleLabel}`);
        sections.push("-".repeat(angleLabel.length + 3));

        if (response.results.length === 0) {
          sections.push("No results found for this angle.\n");
          continue;
        }

        for (const r of response.results) {
          sections.push(`- **${r.title || "Untitled"}**`);
          sections.push(`  URL: ${r.url}`);
          if (r.publishedDate) sections.push(`  Date: ${r.publishedDate}`);
          if (r.highlights && r.highlights.length > 0) {
            const hl = r.highlights.slice(0, 2).join(" ... ");
            sections.push(`  Key: ${hl}`);
          }
          if (r.text) {
            const snippet = r.text.slice(0, 200);
            sections.push(`  Excerpt: ${snippet}${r.text.length > 200 ? "..." : ""}`);
          }
          sections.push("");
        }
      }

      sections.unshift(
        `Total results across all angles: ${totalResults} (from ${responses.length} angles)\n`,
      );

      return sections.join("\n");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[exa-company-deep-dive] Error:", message);
      return `Error during company deep dive on "${input.companyName}": ${message}`;
    }
  },
  // Compact summary for the model — full results go to channels/frontend via action.result events.
  // This prevents context bloat when the agent makes multiple Exa calls.
  toModelOutput(output: string) {
    if (output.startsWith("Error")) return { type: "text" as const, value: output };
    // Extract the total results count from the output
    const totalMatch = output.match(/Total results across all angles: (\d+)/);
    const total = totalMatch ? totalMatch[1] : "unknown";
    // Extract top findings from each angle section
    const angleSections = output.split(/^## /m).slice(1);
    const summaries = angleSections.slice(0, 4).map((section) => {
      const title = section.split("\n")[0]?.replace(/-+$/, "").trim() ?? "";
      const titles = [...section.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]).slice(0, 2);
      return `${title}: ${titles.join(", ") || "no results"}`;
    });
    return {
      type: "text" as const,
      value: `Company Deep Dive complete: ${total} results across ${angleSections.length} angles.\n${summaries.join("\n")}\n\nUse db_write_signals to persist key findings as signals.`,
    };
  },
});
