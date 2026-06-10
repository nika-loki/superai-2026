/**
 * RevenueOS — db-write-research-log tool
 *
 * Updates an agent_runs record with the research results:
 * sets status to "completed", writes the summary, ICP fit score,
 * recommended actions, computes duration, and auto-saves Honcho memory.
 */

import { defineTool } from "experimental-ash/tools";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../lib/db/index";
import { agentRuns, organisations } from "../lib/db/schema";
import { storeAccountMemory } from "../lib/honcho";

const RecommendedActionSchema = z.object({
  action: z.string().describe("The recommended action to take"),
  priority: z.number().int().min(1).max(10).describe("Priority 1-10"),
  rationale: z.string().describe("Why this action is recommended"),
});

export default defineTool({
  description:
    "Finalize an agent run with research results. " +
    "Sets the run status to 'completed', writes the research summary, " +
    "ICP fit score, recommended next actions, and auto-saves memory to Honcho. " +
    "Call this at the END of every research run.",
  inputSchema: z.object({
    agentRunId: z.string().uuid().describe("UUID of the agent run to update"),
    summary: z
      .string()
      .describe("Consolidated research summary for this run"),
    icpFitScore: z
      .number()
      .int()
      .min(0)
      .max(100)
      .optional()
      .describe("ICP fit score 0-100"),
    recommendedActions: z
      .array(RecommendedActionSchema)
      .optional()
      .describe("Recommended next actions with priority and rationale"),
    memoryContent: z
      .string()
      .optional()
      .describe(
        "Structured summary to persist in Honcho memory for future runs. " +
          "Include: key findings, signals discovered, contacts identified, strategic insights, " +
          "and next-run recommendations.",
      ),
  }),
  async execute(input) {
    try {
      console.log(
        `[db-write-research-log] Updating agent run ${input.agentRunId}`,
      );

      // Fetch the existing run to compute duration and resolve org
      const [existingRun] = await db
        .select({ startedAt: agentRuns.startedAt, orgId: agentRuns.orgId })
        .from(agentRuns)
        .where(eq(agentRuns.id, input.agentRunId))
        .limit(1);

      let durationMs: number | null = null;
      if (existingRun?.startedAt) {
        durationMs = Date.now() - existingRun.startedAt.getTime();
      }

      // Auto-save Honcho memory if content provided
      if (input.memoryContent && existingRun?.orgId) {
        try {
          // Resolve peer ID: org.honchoPeerId or fallback to orgId
          const [org] = await db
            .select({ honchoPeerId: organisations.honchoPeerId })
            .from(organisations)
            .where(eq(organisations.id, existingRun.orgId))
            .limit(1);

          const peerId = org?.honchoPeerId ?? existingRun.orgId;
          await storeAccountMemory(peerId, input.memoryContent);
          console.log(
            `[db-write-research-log] Auto-saved Honcho memory for peer "${peerId}" (${input.memoryContent.length} chars)`,
          );
        } catch (memErr) {
          // Memory save failure must NOT block run completion
          console.error(
            `[db-write-research-log] Honcho memory save failed: ${memErr instanceof Error ? memErr.message : String(memErr)}`,
          );
        }
      }

      await db
        .update(agentRuns)
        .set({
          status: "completed",
          summary: input.summary,
          icpFitScore: input.icpFitScore ?? null,
          recommendedActions: input.recommendedActions ?? null,
          durationMs,
          completedAt: new Date(),
        })
        .where(eq(agentRuns.id, input.agentRunId));

      // Safety net: stamp lastResearchedAt on the org
      if (existingRun?.orgId) {
        await db
          .update(organisations)
          .set({ lastResearchedAt: new Date() })
          .where(eq(organisations.id, existingRun.orgId));
      }

      console.log(
        `[db-write-research-log] Updated run ${input.agentRunId} → completed` +
          (durationMs ? ` (${durationMs}ms)` : ""),
      );

      const memoryStatus = input.memoryContent
        ? "saved to Honcho"
        : "NOT provided — call honcho_remember separately!";

      return (
        `Research log updated for run ${input.agentRunId}.\n` +
        `Status: completed\n` +
        `Summary length: ${input.summary.length} chars\n` +
        `ICP Fit Score: ${input.icpFitScore ?? "not set"}\n` +
        `Recommended Actions: ${input.recommendedActions?.length ?? 0}\n` +
        `Memory: ${memoryStatus}\n` +
        `Duration: ${durationMs != null ? `${durationMs}ms` : "unknown"}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[db-write-research-log] Error:", message);
      return `Error updating research log for run ${input.agentRunId}: ${message}`;
    }
  },
});
