/**
 * RevenueOS — honcho-remember tool
 *
 * Stores a piece of knowledge in the agent's persistent memory via Honcho Cloud.
 * Each organisation has its own Honcho peer (honcho_peer_id column in DB).
 *
 * Peer resolution:
 *   1. If agent provides peerId explicitly → use it
 *   2. If orgId provided → look up org.honchoPeerId from DB
 *   3. Fallback → use orgId as peerId (one peer per target account)
 */

import { defineTool } from "experimental-ash/tools";
import { z } from "zod";
import { storeAccountMemory } from "../lib/honcho";
import { db } from "../lib/db/index";
import { organisations } from "../lib/db/schema";
import { eq } from "drizzle-orm";

export default defineTool({
  description:
    "Store a piece of knowledge in the agent's persistent memory via Honcho Cloud. " +
    "Use to remember important findings about an account that should persist across " +
    "research runs (e.g. key contacts, strategic insights, buying signals). " +
    "Provide the orgId — the tool will resolve the correct Honcho peer automatically.",
  inputSchema: z.object({
    orgId: z
      .string()
      .describe("The organisation ID to store memory for"),
    content: z
      .string()
      .describe("The knowledge to store (free-form text)"),
  }),
  async execute(input) {
    // Resolve peerId from the org record
    const peerId = await resolvePeerId(input.orgId);

    try {
      console.log(
        `[honcho-remember] Storing memory for org "${input.orgId}" → peer "${peerId}" (${input.content.length} chars)`,
      );

      await storeAccountMemory(peerId, input.content);

      console.log(
        `[honcho-remember] Memory stored for peer "${peerId}"`,
      );

      return `Memory stored successfully for peer "${peerId}" (${input.content.length} characters).`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[honcho-remember] Error:", message);
      return `Error storing memory: ${message}`;
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
