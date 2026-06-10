/**
 * RevenueOS — Refresh Check Schedule
 *
 * Runs daily at midnight UTC to check for organisations that are due for
 * research. Finds active orgs whose nextRunAt has passed and triggers a new
 * research session for each via the Ash channel.
 *
 * IMPORTANT: db_update_org snaps nextRunAt to midnight UTC so that the
 * displayed time matches when this cron will actually pick it up.
 * The ensure-schedule hook guarantees every completed run sets a schedule.
 *
 * Uses the Ash schedule API (defineSchedule from experimental-ash/schedules).
 */

import { defineSchedule } from "experimental-ash/schedules";
import { db } from "../lib/db/index";
import { organisations } from "../lib/db/schema";
import { and, sql } from "drizzle-orm";
import ashChannelDefault from "../channels/ash";

export default defineSchedule({
  cron: "0 0 * * *", // daily at midnight (Hobby plan compatible)
  async run({ receive, waitUntil, appAuth }) {
    const now = new Date();

    const orgs = await db
      .select({
        id: organisations.id,
        name: organisations.name,
        domain: organisations.domain,
        nextRunAt: organisations.nextRunAt,
        status: organisations.status,
      })
      .from(organisations)
      .where(
        and(
          sql`${organisations.status}::text = 'active'`,
          sql`${organisations.nextRunAt} IS NOT NULL AND ${organisations.nextRunAt} <= ${now.toISOString()}`,
        ),
      )
      .limit(5); // Safety: max 5 concurrent refreshes per hour

    if (orgs.length === 0) {
      console.log("[refresh-check] No orgs due for research");
      return;
    }

    console.log(
      `[refresh-check] Found ${orgs.length} org(s) due for research`,
    );

    for (const org of orgs) {
      console.log(
        `[refresh-check] Triggering refresh for org "${org.name}" (${org.domain})`,
      );

      waitUntil(
        receive(ashChannelDefault, {
          message: `Run a REFRESH research on ${org.name} (${org.domain}). The orgId is ${org.id}. This is a REFRESH RUN — look for NEW trigger events, leadership changes, funding rounds, product launches, partnerships, and competitive shifts since the last research run. Focus only on net-new developments. Use honcho_recall to check what was already reported and do NOT repeat old signals.`,
          target: {},
          auth: appAuth,
        }),
      );
    }
  },
});
