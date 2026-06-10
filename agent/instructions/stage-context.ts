/**
 * RevenueOS — Dynamic Instructions: Stage Context
 *
 * Injects current account state at every turn so the agent knows
 * whether this is a first-run, active engagement, or refresh run.
 *
 * Counts existing contacts, signals, and pending tasks to determine stage.
 */

import { defineDynamic, defineInstructions } from "experimental-ash/instructions";
import { db } from "../lib/db/index";
import { contacts, signals, tasks } from "../lib/db/schema";
import { eq, and, count, sql } from "drizzle-orm";
import { parseSessionContext } from "../lib/parse-context";

export default defineDynamic({
  events: {
    async "turn.started"(_event, ctx) {
      const { orgId } = parseSessionContext(ctx);
      if (!orgId) return null;

      const [cc] = await db
        .select({ count: count() })
        .from(contacts)
        .where(eq(contacts.orgId, orgId));

      const [sc] = await db
        .select({ count: count() })
        .from(signals)
        .where(eq(signals.orgId, orgId));

      const [tc] = await db
        .select({ count: count() })
        .from(tasks)
        .where(and(eq(tasks.orgId, orgId), sql`${tasks.status}::text = 'pending'`));

      const isFirstRun = cc.count === 0 && sc.count === 0;

      let stage: string;
      if (isFirstRun) {
        stage = [
          `**Stage: NEW PROSPECT** — First research run.`,
          `- Plan comprehensive research: company intelligence + contact discovery`,
          `- Use \`exa_company_deep_dive\` and \`exa_people_search\` in parallel for efficiency`,
        ].join("\n");
      } else if (tc.count > 0) {
        stage = [
          `**Stage: ACTIVE ENGAGEMENT** — ${cc.count} contacts, ${sc.count} signals, ${tc.count} pending tasks.`,
          `- Focus on what changed since last run`,
          `- Review pending tasks and update status`,
        ].join("\n");
      } else {
        stage = [
          `**Stage: REFRESH RUN** — ${cc.count} contacts, ${sc.count} signals, 0 pending tasks.`,
          `- Targeted refresh for new trigger events`,
          `- Look for changes in leadership, funding, product launches`,
        ].join("\n");
      }

      return defineInstructions({
        markdown: `# Current Account State\n\n${stage}`,
      });
    },
  },
});
