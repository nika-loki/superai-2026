/**
 * RevenueOS — Dynamic Instructions: Honcho Memory Recall
 *
 * Injects accumulated account memory at session start via Honcho Cloud.
 * Each target organisation has its own Honcho peer (honcho_peer_id).
 *
 * Peer resolution chain:
 *   1. org.honchoPeerId from DB (explicitly set per org)
 *   2. honchoPeerId from session context metadata
 *   3. orgId as fallback peer (one peer per target account)
 *
 * Falls back gracefully if Honcho is unavailable or no peer exists yet.
 */

import { defineDynamic, defineInstructions } from "experimental-ash/instructions";
import { db } from "../lib/db/index";
import { organisations } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import { recallAccountMemory } from "../lib/honcho";
import { parseSessionContext } from "../lib/parse-context";

export default defineDynamic({
  events: {
    async "session.started"(_event, ctx) {
      const { orgId, honchoPeerId: ctxPeerId } = parseSessionContext(ctx);
      if (!orgId) {
        return defineInstructions({
          markdown:
            "# Accumulated Account Memory\n\nNo account context provided — cannot recall prior memory.",
        });
      }

      // Resolve peer: DB honchoPeerId > context metadata > orgId fallback
      let peerId = ctxPeerId ?? orgId;

      try {
        const [org] = await db
          .select({ honchoPeerId: organisations.honchoPeerId })
          .from(organisations)
          .where(eq(organisations.id, orgId));

        if (org?.honchoPeerId) {
          peerId = org.honchoPeerId;
        }
      } catch {
        // DB lookup failed — use fallback peerId
      }

      try {
        const memory = await recallAccountMemory(
          peerId,
          "Summarize everything known about this target account: contacts, signals, ICP fit, what worked, stakeholder insights, market observations.",
        );

        return defineInstructions({
          markdown: `# Accumulated Account Memory\n\n**Peer ID:** ${peerId}\n\n${memory}`,
        });
      } catch {
        return defineInstructions({
          markdown:
            "# Accumulated Account Memory\n\nHoncho recall failed. Proceed without prior context.",
        });
      }
    },
  },
});
