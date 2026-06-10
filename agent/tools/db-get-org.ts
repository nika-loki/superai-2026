/**
 * RevenueOS — db-get-org tool
 *
 * Fetches an organisation's full details from the database by ID.
 * Returns name, domain, HQ, ICP description, score, status, and properties.
 * Organisation.md (seller's ICP) is loaded via dynamic instructions, not here.
 */

import { defineTool } from "experimental-ash/tools";
import { z } from "zod";
import { db } from "../lib/db/index";
import { organisations } from "../lib/db/schema";
import { eq } from "drizzle-orm";

export default defineTool({
  description:
    "Fetch full organisation details by ID. Returns name, domain, HQ country, " +
    "ICP description, opportunity score, status, lastResearchedAt, and properties. " +
    "Call this FIRST before starting any research to understand the target account. " +
    "Note: Organisation.md (seller's ICP) is loaded separately via dynamic instructions.",
  inputSchema: z.object({
    orgId: z.string().uuid().describe("UUID of the organisation to look up"),
  }),
  async execute(input) {
    try {
      const [org] = await db
        .select()
        .from(organisations)
        .where(eq(organisations.id, input.orgId))
        .limit(1);

      if (!org) {
        return `Organisation with ID ${input.orgId} not found.`;
      }

      const lines = [
        `# ${org.name}`,
        `Domain: ${org.domain}`,
        `HQ: ${org.hqCountry}`,
        `Status: ${org.status ?? "onboarding"}`,
        `ICP Score: ${org.opportunityScore ?? "not set"}`,
        `Last Researched: ${org.lastResearchedAt?.toISOString() ?? "never"}`,
        `Refresh Interval: ${org.refreshIntervalDays ?? "not set"} days`,
        ``,
        `## ICP Description`,
        org.icpDescription,
      ];

      if (org.properties && Array.isArray(org.properties) && org.properties.length > 0) {
        lines.push("", "## Properties");
        for (const p of org.properties as Array<{ key: string; value: string }>) {
          lines.push(`- ${p.key}: ${p.value}`);
        }
      }

      return lines.join("\n");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[db-get-org] Error:", message);
      return `Error fetching organisation ${input.orgId}: ${message}`;
    }
  },
});
