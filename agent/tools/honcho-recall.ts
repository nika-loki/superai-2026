/**
 * RevenueOS — honcho-recall tool
 *
 * Recalls accumulated knowledge about an account from Honcho Cloud's
 * persistent memory. Each organisation has its own Honcho peer.
 *
 * Peer resolution:
 *   1. Look up org.honchoPeerId from DB
 *   2. Fallback → use orgId as peerId
 */

import { defineTool } from "experimental-ash/tools";
import { z } from "zod";
import { recallAccountMemory } from "../lib/honcho";
import { db } from "../lib/db/index";
import { organisations } from "../lib/db/schema";
import { eq } from "drizzle-orm";

export default defineTool({
  description:
    "Recall accumulated knowledge about an account from the agent's persistent memory. " +
    "Use to retrieve insights from previous research runs before starting a new one. " +
    "Provide the orgId — the tool will resolve the correct Honcho peer automatically.",
  inputSchema: z.object({
    orgId: z
      .string()
      .describe("The organisation ID to recall memory for"),
    query: z
      .string()
      .describe("What to recall (natural language, e.g. 'key decision makers at this company')"),
  }),
  async execute(input) {
    // Resolve peerId from the org record
    const peerId = await resolvePeerId(input.orgId);

    try {
      console.log(
        `[honcho-recall] Recalling for org "${input.orgId}" → peer "${peerId}": "${input.query.slice(0, 60)}${input.query.length > 60 ? "..." : ""}"`,
      );

      const result = await recallAccountMemory(peerId, input.query);

      if (!result || result.trim().length === 0) {
        console.log(
          `[honcho-recall] No memories found for peer "${peerId}"`,
        );
        return `No memories found for peer "${peerId}" matching query: "${input.query}".`;
      }

      console.log(
        `[honcho-recall] Recalled ${result.length} chars for peer "${peerId}"`,
      );

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[honcho-recall] Error:", message);
      return `Error recalling memory: ${message}`;
    }
  },
});

/**
 * Resolve the Honcho peerId for an organisation.
 * Reads org.honchoPeerId from DB, falls back to orgId.
 */
async function resolvePeerId(orgId: string): Promise<string> {
  try {
    const [org] = await db
      .select({ honchoPeerId: organisations.honchoPeerId })
      .from(organisations)
      .where(eq(organisations.id, orgId));

    if (org?.honchoPeerId) {
      return org.honchoPeerId;
    }
  } catch {
    // DB lookup failed — use orgId as fallback
  }

  return orgId;
}
