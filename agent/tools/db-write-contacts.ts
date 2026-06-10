/**
 * RevenueOS — db-write-contacts tool
 *
 * Persists discovered contacts to the database. Deduplicates by
 * (orgId, linkedinUrl) using onConflictDoNothing.
 */

import { defineTool } from "experimental-ash/tools";
import { z } from "zod";
import { db } from "../lib/db/index";
import { contacts } from "../lib/db/schema";

const ContactInputSchema = z.object({
  name: z.string().describe("Full name of the contact"),
  title: z.string().optional().describe("Job title"),
  linkedinUrl: z.string().optional().describe("LinkedIn profile URL"),
  email: z.string().optional().describe("Email address"),
  seniority: z
    .string()
    .optional()
    .describe('Seniority level (e.g. "C-Suite", "VP", "Director")'),
  properties: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
        type: z.enum(["text", "number", "url", "date"]),
      }),
    )
    .optional()
    .describe("Dynamic key-value properties (location, department, etc.)"),
  relevanceNote: z
    .string()
    .optional()
    .describe(
      "Founder-style briefing on this contact. Must include: " +
        "(1) what they publicly care about (recent quotes, talks, LinkedIn posts); " +
        "(2) their background context (where they came from, what informs their thinking); " +
        "(3) why they'd take a call from the seller specifically; " +
        "(4) best approach angle — suggested opening line or conversation topic. " +
        "NOT generic 'leads X function' — write like a founder telling a rep exactly how to approach this person.",
    ),
});

export default defineTool({
  description:
    "Persist discovered contacts to the database. " +
    "Deduplicates by (orgId, linkedInUrl) so re-running research does not create duplicates. " +
    "Provide an array of contacts with name (required) and optional title, linkedinUrl, email, " +
    "seniority, properties, and relevanceNote.",
  inputSchema: z.object({
    orgId: z.string().uuid().describe("UUID of the organisation these contacts belong to"),
    contacts: z
      .array(ContactInputSchema)
      .min(1)
      .max(100)
      .describe("Array of contacts to persist (1-100)"),
  }),
  async execute(input) {
    try {
      console.log(
        `[db-write-contacts] Writing ${input.contacts.length} contacts for org ${input.orgId}`,
      );

      const values = input.contacts.map((c) => ({
        orgId: input.orgId,
        name: c.name,
        title: c.title ?? null,
        linkedinUrl: c.linkedinUrl ?? null,
        email: c.email ?? null,
        seniority: c.seniority ?? "unknown",
        properties: c.properties ?? [],
        source: "exa",
        relevanceNote: c.relevanceNote ?? null,
      }));

      const result = await db
        .insert(contacts)
        .values(values)
        .onConflictDoNothing({
          target: [contacts.orgId, contacts.linkedinUrl],
        });

      // Drizzle returns a Result object; rowCount is available on the underlying pg result
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rowCount = (result as any)?.rowCount ?? input.contacts.length;

      console.log(
        `[db-write-contacts] Wrote ${rowCount} contacts for org ${input.orgId}`,
      );

      return `Successfully wrote ${rowCount} contacts for organisation ${input.orgId}. Total submitted: ${input.contacts.length}.`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[db-write-contacts] Error:", message);
      return `Error writing contacts for org ${input.orgId}: ${message}`;
    }
  },
});
