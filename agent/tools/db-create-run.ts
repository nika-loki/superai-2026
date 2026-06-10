/**
 * RevenueOS — db-create-run tool
 *
 * Creates a new agent_run record with status "running".
 * Call this at the start of every research session.
 */

import { defineTool } from "experimental-ash/tools";
import { z } from "zod";
import { db } from "../lib/db/index";
import { agentRuns } from "../lib/db/schema";

export default defineTool({
  description:
    "Create a new agent run record in the database. Call this at the START of every " +
    "research session. Returns the run ID. The run status is set to 'running'. " +
    "After research completes, use db-write-research-log to finalize it.",
  inputSchema: z.object({
    orgId: z.string().uuid().describe("UUID of the organisation being researched"),
    ashSessionId: z.string().optional().describe("The Ash session ID for this run"),
  }),
  async execute(input) {
    try {
      const [run] = await db
        .insert(agentRuns)
        .values({
          orgId: input.orgId,
          ashSessionId: input.ashSessionId ?? null,
          status: "running",
          startedAt: new Date(),
        })
        .returning({ id: agentRuns.id });

      console.log(`[db-create-run] Created run ${run.id} for org ${input.orgId}`);
      return `Agent run created. Run ID: ${run.id}. Status: running. Use this ID when calling db-write-research-log and db-write-signals.`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[db-create-run] Error:", message);
      return `Error creating agent run: ${message}`;
    }
  },
});
