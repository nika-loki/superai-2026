/**
 * RevenueOS — Dynamic Instructions: Seller ICP + Target Account
 *
 * Injects THREE contexts at session start:
 * 1. The workspace's Organisation.md (from S3 at <workspace_id>/org.md) — SELLER's ICP
 * 2. The target organisation details (who we're researching this session)
 * 3. The org's Honcho peer ID for memory operations
 *
 * Uses channel.metadata to pass the orgId into the session.
 */

import { defineDynamic, defineInstructions } from "experimental-ash/instructions";
import { db } from "../lib/db/index";
import { organisations } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import { getOrganisationMd } from "../../lib/s3";
import { parseSessionContext } from "../lib/parse-context";

export default defineDynamic({
  events: {
    async "session.started"(_event, ctx) {
      const { orgId } = parseSessionContext(ctx);
      if (!orgId) return null;

      // Fetch the target organisation
      const [org] = await db
        .select({
          name: organisations.name,
          domain: organisations.domain,
          hqCountry: organisations.hqCountry,
          icpDescription: organisations.icpDescription,
          properties: organisations.properties,
          opportunityScore: organisations.opportunityScore,
          status: organisations.status,
          workspaceId: organisations.workspaceId,
          honchoPeerId: organisations.honchoPeerId,
        })
        .from(organisations)
        .where(eq(organisations.id, orgId));

      if (!org) return null;

      // Fetch the workspace's Organisation.md from S3
      const sellerIcp =
        (await getOrganisationMd(org.workspaceId)) ??
        `No Organisation.md configured yet. Ask the user to set up their seller profile in workspace settings.`;

      // The Honcho peer ID — either explicitly set or fallback to orgId
      const honchoPeerId = org.honchoPeerId ?? orgId;

      return defineInstructions({
        markdown: [
          `# Your Seller's Identity (Organisation.md)`,
          ``,
          `This defines WHO you work for — the seller's company, product, ICP, and engagement strategy.`,
          `You are NOT a detached analyst. You write from this seller's POV, as if you are the founder briefing your sales team.`,
          `Every signal's icpRelevance, every contact's relevanceNote, and every task's description must be written so a salesperson can act on it immediately.`,
          `Cite specific seller capabilities by name. Give conversation angles. Provide opening lines.`,
          ``,
          sellerIcp,
          ``,
          `---`,
          ``,
          `# Target Account (Research Subject)`,
          ``,
          `**Company:** ${org.name} (${org.domain})`,
          `**HQ:** ${org.hqCountry}`,
          `**Current Score:** ${org.opportunityScore ?? "Not yet scored"}`,
          `**Status:** ${org.status}`,
          `**Honcho Peer ID:** ${honchoPeerId}`,
          `**Why this target:** ${org.icpDescription}`,
          ``,
          `Evaluate this target against the seller's ICP defined above. When writing signals, contacts, and tasks:`,
          `- icpRelevance must cite specific seller capabilities and explain WHY the target is receptive NOW`,
          `- contact relevanceNote must include what this person cares about, their background, and how to approach them`,
          `- task descriptions must include WHO (name/title/context), WHAT to say (talking points + opening line), and HOW to approach (channel + angle)`,
          ``,
          `When using honcho-remember or honcho-recall, pass the orgId \`${orgId}\` — the tools will automatically resolve to the correct Honcho peer (${honchoPeerId}).`,
        ].join("\n"),
      });
    },
  },
});
