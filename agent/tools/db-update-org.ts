/**
 * RevenueOS — db-update-org tool
 *
 * Updates an organisation record with research findings:
 * opportunity score, status, properties, ICP description, refresh interval.
 * Computes nextRunAt from refreshIntervalDays if provided.
 */

import { defineTool } from "experimental-ash/tools";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../lib/db/index";
import { organisations } from "../lib/db/schema";

const PropertySchema = z.object({
  key: z.string(),
  value: z.string(),
  type: z.enum(["text", "number", "url", "date"]),
});

export default defineTool({
  description:
    "Update an organisation (target account) record with research findings. " +
    "Can set opportunity score, status, dynamic properties, ICP description, " +
    "and refresh interval. Computes nextRunAt automatically from refreshIntervalDays. " +
    "NOTE: Organisation.md (seller ICP) is workspace-level and cannot be updated here.",
  inputSchema: z.object({
    orgId: z.string().uuid().describe("UUID of the organisation to update"),
    opportunityScore: z
      .number()
      .int()
      .min(0)
      .max(100)
      .optional()
      .describe("Updated opportunity score 0-100"),
    refreshIntervalDays: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Days between automatic re-research runs"),
    status: z
      .enum(["onboarding", "active", "paused", "churned"])
      .optional()
      .describe("Updated organisation status"),
    properties: z
      .array(PropertySchema)
      .optional()
      .describe("Dynamic key-value properties to set on the organisation"),
  }),
  async execute(input) {
    try {
      console.log(`[db-update-org] Updating organisation ${input.orgId}`);

      // Build the update set dynamically — only include provided fields
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
        lastResearchedAt: new Date(),
      };

      if (input.opportunityScore !== undefined) {
        updateData.opportunityScore = input.opportunityScore;
      }

      if (input.refreshIntervalDays !== undefined) {
        updateData.refreshIntervalDays = input.refreshIntervalDays;
        // Compute nextRunAt aligned to midnight UTC (cron checks at 00:00 daily)
        // If we set nextRunAt to e.g. 3pm on day X, the midnight cron on day X
        // won't pick it up (3pm > midnight), causing up to 24h delay.
        const nextRun = new Date();
        nextRun.setDate(nextRun.getDate() + input.refreshIntervalDays);
        nextRun.setUTCHours(0, 0, 0, 0); // snap to midnight UTC
        updateData.nextRunAt = nextRun;
      }

      if (input.status !== undefined) {
        updateData.status = input.status;
      }

      if (input.properties !== undefined) {
        updateData.properties = input.properties;
      }

      await db
        .update(organisations)
        .set(updateData)
        .where(eq(organisations.id, input.orgId));

      console.log(
        `[db-update-org] Updated org ${input.orgId} — fields: ${Object.keys(updateData).join(", ")}`,
      );

      const parts = [`Organisation ${input.orgId} updated successfully. Fields updated:`];

      if (input.opportunityScore !== undefined) {
        parts.push(`  Opportunity Score: ${input.opportunityScore}`);
      }
      if (input.refreshIntervalDays !== undefined) {
        parts.push(`  Refresh Interval: ${input.refreshIntervalDays} days`);
        parts.push(`  Next Run At: ${updateData.nextRunAt != null ? new Date(updateData.nextRunAt as Date).toISOString() : "not set"}`);
      }
      if (input.status !== undefined) {
        parts.push(`  Status: ${input.status}`);
      }
      if (input.properties !== undefined) {
        parts.push(`  Properties: ${input.properties.length} items`);
      }

      return parts.join("\n");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[db-update-org] Error:", message);
      return `Error updating organisation ${input.orgId}: ${message}`;
    }
  },
});
