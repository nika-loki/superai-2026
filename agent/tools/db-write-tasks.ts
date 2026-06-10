/**
 * RevenueOS — db-write-tasks tool
 *
 * Persists recommended engagement tasks to the database.
 */

import { defineTool } from "experimental-ash/tools";
import { z } from "zod";
import { db } from "../lib/db/index";
import { tasks } from "../lib/db/schema";

const TaskInputSchema = z.object({
  type: z
    .string()
    .describe('Task type (e.g. "send_email", "linkedin_dm", "schedule_call", "research_deeper")'),
  description: z
    .string()
    .describe(
      "Human-readable brief written like a founder WhatsApp to a sales rep. MUST include: " +
        "(1) WHO — person's name, title, what they're dealing with right now; " +
        "(2) WHAT to say — specific talking points and a suggested opening line usable verbatim; " +
        "(3) HOW to approach — channel (email/LinkedIn/call) and angle that resonates with this person. " +
        "A salesperson reading this must be able to execute the task immediately without any further research.",
    ),
  rationale: z
    .string()
    .describe(
      "Evidence brief: (1) Direct quotes from sources proving the timing window; " +
        "(2) Why this person specifically — their role, recent activity, what's on their plate; " +
        "(3) Why SalesDuo specifically — name the exact capability that matches their current need; " +
        "(4) Signal UUIDs that triggered this task.",
    ),
  priority: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Priority 1-100 (1-20 = act this week, 21-40 = this month, 41-60 = this quarter, 61-100 = monitor)"),
  contactId: z
    .string()
    .uuid()
    .optional()
    .describe("UUID of the related contact"),
  signalIds: z
    .array(z.string().uuid())
    .optional()
    .describe("UUIDs of the signals that triggered this task — links task to evidence"),
});

export default defineTool({
  description:
    "Persist recommended engagement tasks to the database. Tasks are read by salespeople — " +
    "write descriptions like a founder briefing a rep (WHO exactly, WHAT to say with opening line, HOW to approach). " +
    "Write rationales with direct quote evidence, why this person specifically, and which SalesDuo capability matches.",
  inputSchema: z.object({
    orgId: z.string().uuid().describe("UUID of the organisation"),
    agentRunId: z
      .string()
      .uuid()
      .optional()
      .describe("UUID of the agent run that created these tasks"),
    tasks: z.array(TaskInputSchema).min(1).max(50).describe("Array of tasks to create"),
  }),
  async execute(input) {
    try {
      console.log(
        `[db-write-tasks] Writing ${input.tasks.length} tasks for org ${input.orgId}`,
      );

      const values = input.tasks.map((t) => ({
        orgId: input.orgId,
        agentRunId: input.agentRunId ?? null,
        contactId: t.contactId ?? null,
        type: t.type,
        description: t.description,
        rationale: t.rationale,
        signalIds: t.signalIds ?? [],
        priority: t.priority ?? 50,
      }));

      await db.insert(tasks).values(values);

      return `Successfully wrote ${input.tasks.length} tasks for organisation ${input.orgId}.`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[db-write-tasks] Error:", message);
      return `Error writing tasks: ${message}`;
    }
  },
});
