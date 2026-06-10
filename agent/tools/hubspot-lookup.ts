/**
 * RevenueOS — hubspot-lookup tool (lightweight)
 *
 * Searches the connected HubSpot CRM for existing data about a company or contact.
 * Delegates to the Next.js API route to avoid importing the 10MB @hubspot/api-client SDK.
 */

import { defineTool } from "experimental-ash/tools";
import { z } from "zod";
import { db } from "../lib/db/index";
import { organisations, contacts as contactsTable } from "../lib/db/schema";
import { eq, or, ilike } from "drizzle-orm";

export default defineTool({
  description:
    "Check if a company or contact already exists in RevenueOS (imported from HubSpot CRM). " +
    "Searches by domain, name, or email. Returns matching organisations with their contacts and deals. " +
    "Use this BEFORE starting Exa research to avoid duplicating effort on accounts already in the CRM.",

  inputSchema: z.object({
    query: z.string()
      .describe("Search term: company domain (e.g. 'grab.com'), company name, or contact email"),
  }),

  async execute(input) {
    try {
      const q = input.query.trim();

      // Search organisations by domain or name
      const orgResults = await db
        .select()
        .from(organisations)
        .where(
          or(
            ilike(organisations.domain, `%${q}%`),
            ilike(organisations.name, `%${q}%`),
          ),
        )
        .limit(10);

      if (orgResults.length === 0) {
        return `No existing CRM data found for "${q}". This appears to be a new account — proceed with fresh research.`;
      }

      const lines: string[] = [`Found ${orgResults.length} organisation(s) matching "${q}":`];

      for (const org of orgResults) {
        lines.push("");
        lines.push(`## ${org.name}`);
        lines.push(`ID: ${org.id}`);
        lines.push(`Domain: ${org.domain}`);
        lines.push(`HQ: ${org.hqCountry}`);
        lines.push(`Status: ${org.status ?? "onboarding"}`);
        lines.push(`ICP Score: ${org.opportunityScore ?? "not set"}`);
        lines.push(`Last Researched: ${org.lastResearchedAt?.toISOString() ?? "never"}`);

        // Fetch contacts for this org
        const orgContacts = await db
          .select()
          .from(contactsTable)
          .where(eq(contactsTable.orgId, org.id))
          .limit(20);

        if (orgContacts.length > 0) {
          lines.push("");
          lines.push(`### Contacts (${orgContacts.length})`);
          for (const c of orgContacts) {
            lines.push(`- ${c.name}${c.title ? ` (${c.title})` : ""}${c.email ? ` — ${c.email}` : ""}${c.seniority ? ` [${c.seniority}]` : ""}${c.source === "hubspot" ? " (from CRM)" : ""}`);
          }
        }
      }

      return lines.join("\n");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `CRM lookup error: ${message}`;
    }
  },
});
