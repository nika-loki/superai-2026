/**
 * RevenueOS — db-update-signal tool
 *
 * Updates an existing signal — primarily used to link a signal to a contact
 * after cross-referencing people research with company signals.
 * Also allows updating icpRelevance or impact after synthesis.
 */

import { defineTool } from "experimental-ash/tools";
import { z } from "zod";
import { db } from "../lib/db/index";
import { signals } from "../lib/db/schema";
import { eq } from "drizzle-orm";

export default defineTool({
  description:
    "Update an existing signal. Use to link a signal to a contact after cross-referencing " +
    "people research with company signals, or to update the ICP relevance or impact score. " +
    "Call this during the synthesis phase when you discover that a signal relates to a specific person.",

  inputSchema: z.object({
    signalId: z.string().uuid().describe("UUID of the signal to update"),
    contactId: z
      .string()
      .uuid()
      .optional()
      .describe("UUID of the contact this signal is about"),
    icpRelevance: z
      .string()
      .optional()
      .describe("Updated ICP relevance explanation"),
    impact: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe("Updated impact score 1-10"),
  }),

  async execute(input) {
    try {
      const updates: Record<string, unknown> = {};
      if (input.contactId !== undefined) updates.contactId = input.contactId;
      if (input.icpRelevance !== undefined) updates.icpRelevance = input.icpRelevance;
      if (input.impact !== undefined) updates.impact = input.impact;

      if (Object.keys(updates).length === 0) {
        return "No fields to update — provide at least one of: contactId, icpRelevance, impact.";
      }

      const [updated] = await db
        .update(signals)
        .set(updates)
        .where(eq(signals.id, input.signalId))
        .returning({ id: signals.id, title: signals.title });

      if (!updated) {
        return `Signal ${input.signalId} not found.`;
      }

      return `Updated signal "${updated.title}" (${Object.keys(updates).join(", ")}).`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[db-update-signal] Error:", message);
      return `Error updating signal: ${message}`;
    }
  },
});
