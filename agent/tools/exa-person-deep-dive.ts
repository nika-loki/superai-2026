/**
 * RevenueOS — exa-person-deep-dive tool
 *
 * Runs 6 parallel Exa searches across different person intelligence angles
 * (speeches, podcasts, conferences, LinkedIn, social, news).
 * Returns all findings grouped by angle.
 */

import { defineTool } from "experimental-ash/tools";
import { z } from "zod";
import { exaPersonDeepDive } from "../lib/exa";

const ANGLE_LABELS = [
  "Speeches & Talks",
  "Podcast Appearances",
  "Conference Attendance",
  "LinkedIn Activity",
  "Social Interests",
  "Recent News",
] as const;

export default defineTool({
  description:
    "Deep-dive research on a specific person across 6 intelligence angles: " +
    "speeches, podcast appearances, conferences, LinkedIn activity, social interests, " +
    "and recent news. Runs 6 parallel searches and returns findings grouped by angle. " +
    "Automatically filters to results published within the last 60 days.",
  inputSchema: z.object({
    personName: z.string().describe("Full name of the person to research"),
    company: z
      .string()
      .optional()
      .describe("Company the person works at (adds context)"),
    linkedinUrl: z
      .string()
      .optional()
      .describe("LinkedIn URL to help identify the right person"),
  }),
  async execute(input) {
    try {
      console.log(
        `[exa-person-deep-dive] Starting deep dive on "${input.personName}"` +
          (input.company ? ` at ${input.company}` : ""),
      );

      const responses = await exaPersonDeepDive({
        personName: input.personName,
        company: input.company,
        linkedinUrl: input.linkedinUrl,
        startPublishedDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const sections: string[] = [
        `Person Deep Dive: ${input.personName}${input.company ? ` (${input.company})` : ""}`,
        `=${"=".repeat(input.personName.length + (input.company ? input.company.length + 3 : 0) + 19)}`,
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
      console.error("[exa-person-deep-dive] Error:", message);
      return `Error during person deep dive on "${input.personName}": ${message}`;
    }
  },
});
