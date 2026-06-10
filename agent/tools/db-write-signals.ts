/**
 * RevenueOS — db-write-signals tool
 *
 * Persists detected intelligence signals to the database.
 * Each signal has a type (dynamic text), title, quotes, ICP relevance,
 * sources, impact score, and an optional link to a contact.
 */

import { defineTool } from "experimental-ash/tools";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../lib/db/index";
import { signals } from "../lib/db/schema";

const SignalInputSchema = z.object({
  type: z
    .string()
    .describe(
      'Signal category (e.g. "funding_round", "leadership_change", "product_launch")',
    ),
  title: z.string().describe("Short descriptive title for the signal"),
  quotes: z
    .array(
      z.object({
        text: z.string(),
        speaker: z.string().optional(),
        source: z.string().optional(),
      }),
    )
    .min(1)
    .describe("Supporting quotes from sources"),
  icpRelevance: z
    .string()
    .describe(
      "Why this signal matters for the SELLER specifically — written from the seller's POV. " +
        "Must cite: (1) the specific seller capability this opens a door for; " +
        "(2) why the target would be receptive right now; " +
        "(3) the conversation angle this creates. " +
        "NOT generic analyst language like 'creates demand for X' — " +
        "write like a founder explaining to a rep why this is our moment. " +
        "Example: 'Their new VP Sales is building an enterprise team from scratch across 5 APAC markets — " +
        "they need autonomous account research at scale. Our Signal Monitoring and Buying Committee Mapping " +
        "is exactly what a solo VP scaling a new team needs to compete.'",
    ),
  sources: z
    .array(
      z.object({
        url: z.string(),
        title: z.string(),
        publishedDate: z.string().optional(),
      }),
    )
    .min(1)
    .describe("Source URLs for this signal"),
  impact: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("Impact score 1-10 (10 = highest)"),
  contactId: z
    .string()
    .uuid()
    .optional()
    .describe("UUID of a related contact, if the signal is person-specific"),
});

export default defineTool({
  description:
    "Persist detected intelligence signals to the database. " +
    "Each signal has a dynamic type, title, supporting quotes, ICP relevance, " +
    "source URLs, and an optional impact score and linked contact. " +
    "ICP relevance MUST be written from the seller's POV — cite specific seller capabilities, " +
    "explain why the target is receptive NOW, and give a conversation angle. " +
    "Automatically deduplicates against existing signals and filters stale sources (>${60} days).",
  inputSchema: z.object({
    orgId: z.string().uuid().describe("UUID of the organisation these signals belong to"),
    agentRunId: z
      .string()
      .uuid()
      .optional()
      .describe("UUID of the agent run that discovered these signals"),
    signals: z
      .array(SignalInputSchema)
      .min(1)
      .max(100)
      .describe("Array of signals to persist (1-100)"),
  }),
  async execute(input) {
    try {
      console.log(
        `[db-write-signals] Writing ${input.signals.length} signals for org ${input.orgId}`,
      );

      // Validate source recency — filter out stale sources (>60 days)
      const MAX_SOURCE_AGE_DAYS = 60;
      const now = Date.now();
      const DAY_MS = 24 * 60 * 60 * 1000;

      const recencyFiltered = input.signals
        .map((s) => {
          const freshSources = s.sources.filter((source) => {
            if (!source.publishedDate) return true; // No date — trust the agent
            const ageDays =
              (now - new Date(source.publishedDate).getTime()) / DAY_MS;
            return ageDays <= MAX_SOURCE_AGE_DAYS;
          });
          if (freshSources.length === 0) return null; // All sources stale — drop signal
          return { ...s, sources: freshSources };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);

      if (recencyFiltered.length === 0) {
        console.log(
          `[db-write-signals] All ${input.signals.length} signals had only stale sources (>${MAX_SOURCE_AGE_DAYS} days) for org ${input.orgId}`,
        );
        return `All ${input.signals.length} signals were filtered — sources older than ${MAX_SOURCE_AGE_DAYS} days. No signals written.`;
      }

      if (recencyFiltered.length < input.signals.length) {
        console.log(
          `[db-write-signals] Recency filter: ${input.signals.length} → ${recencyFiltered.length} signals (dropped ${input.signals.length - recencyFiltered.length} with stale sources)`,
        );
      }

      // Dedup against existing signals for this org (title similarity)
      const existing = await db
        .select({ title: signals.title, type: signals.type })
        .from(signals)
        .where(eq(signals.orgId, input.orgId));

      const deduped = recencyFiltered.filter((s) => {
        const normalize = (t: string) =>
          t.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
        const words = new Set(normalize(s.title));
        if (words.size === 0) return true;
        const isDuplicate = existing.some((e: (typeof existing)[number]) => {
          if (e.type !== s.type) return false;
          const eWords = new Set(normalize(e.title));
          if (eWords.size === 0) return false;
          let overlap = 0;
          for (const w of words) {
            if (eWords.has(w)) overlap++;
          }
          return overlap / Math.min(words.size, eWords.size) > 0.8;
        });
        return !isDuplicate;
      });

      if (deduped.length < recencyFiltered.length) {
        console.log(
          `[db-write-signals] Dedup filter: ${recencyFiltered.length} → ${deduped.length} signals (filtered ${recencyFiltered.length - deduped.length} duplicates) for org ${input.orgId}`,
        );
      }

      if (deduped.length === 0) {
        console.log(
          `[db-write-signals] All ${recencyFiltered.length} signals were duplicates of existing signals for org ${input.orgId}`,
        );
        return `All ${recencyFiltered.length} signals were duplicates of existing signals for organisation ${input.orgId}. No new signals written.`;
      }

      const values = deduped.map((s) => ({
        orgId: input.orgId,
        agentRunId: input.agentRunId ?? null,
        contactId: s.contactId ?? null,
        type: s.type,
        title: s.title,
        quotes: s.quotes,
        icpRelevance: s.icpRelevance,
        sources: s.sources,
        impact: s.impact ?? null,
      }));

      await db.insert(signals).values(values);

      console.log(
        `[db-write-signals] Wrote ${values.length} signals for org ${input.orgId}`,
      );

      return `Successfully wrote ${values.length} signals for organisation ${input.orgId}.`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[db-write-signals] Error:", message);
      return `Error writing signals for org ${input.orgId}: ${message}`;
    }
  },
});
