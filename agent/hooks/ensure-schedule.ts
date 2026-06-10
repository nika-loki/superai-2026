/**
 * RevenueOS — Ensure Schedule Hook
 *
 * Compulsory pre-finish hook that guarantees every completed research run
 * sets a valid refresh schedule on the organisation.
 *
 * How it works:
 * 1. Tracks whether db_update_org was called with refreshIntervalDays during
 *    the session (via actions.requested events).
 * 2. On session.completed, if scheduling was NOT set:
 *    a. Look up the org from the agent_run
 *    b. Derive refreshIntervalDays from the opportunityScore (score→interval table)
 *    c. Directly update the organisations table with the computed schedule
 *
 * This ensures no org ever ends up with a null nextRunAt after a completed run,
 * preventing "dead" orgs that never get refreshed.
 *
 * Score → interval mapping (from instructions.md):
 *   87-100 → 1 day  |  70-86 → 3 days  |  50-69 → 14 days  |  0-49 → 30 days
 */

import { defineHook } from "experimental-ash/hooks";
import { eq, and, isNotNull } from "drizzle-orm";
import { db } from "../lib/db/index";
import { agentRuns, organisations } from "../lib/db/schema";

// ── Score → interval derivation ──────────────────────────────────────────

function deriveIntervalFromScore(score: number | null): number {
  if (score === null) return 7; // fallback: weekly
  if (score >= 87) return 1;
  if (score >= 70) return 3;
  if (score >= 50) return 14;
  return 30;
}

/**
 * Compute nextRunAt aligned to midnight UTC.
 * The refresh-check cron runs at 00:00 UTC daily — snapping to midnight
 * ensures the displayed time matches when the cron will actually trigger.
 */
function computeNextRunAt(intervalDays: number): Date {
  const target = new Date();
  target.setDate(target.getDate() + intervalDays);
  target.setUTCHours(0, 0, 0, 0);
  return target;
}

// ── Per-session tracking ─────────────────────────────────────────────────

const sessionScheduleSet = new Map<string, boolean>();

// ── Hook ─────────────────────────────────────────────────────────────────

export default defineHook({
  events: {
    /**
     * Track whether db_update_org is called with refreshIntervalDays.
     * We inspect the tool-call input to see if the scheduling param is present.
     */
    async "actions.requested"(event, _ctx) {
      for (const action of event.data.actions) {
        if (action.kind === "tool-call" && action.toolName === "db_update_org") {
          const rawInput = (action as { input?: unknown }).input;
          const input =
            typeof rawInput === "string"
              ? parseJsonSafe(rawInput)
              : rawInput;

          if (input && typeof input === "object" && "refreshIntervalDays" in input) {
            // The agent explicitly set the interval — mark this session as scheduled
            const sessionId = _ctx.session.id;
            sessionScheduleSet.set(sessionId, true);
            console.log(
              `[ensure-schedule] Agent set refreshIntervalDays=${(input as { refreshIntervalDays: number }).refreshIntervalDays} — scheduling enforced by agent`,
            );
          }
        }
      }
    },

    /**
     * Pre-finish enforcement: if the agent didn't set a schedule, derive one
     * and write it directly to the DB.
     */
    async "session.completed"(_event, ctx) {
      const sessionId = ctx.session.id;
      const wasScheduled = sessionScheduleSet.get(sessionId);

      try {
        if (wasScheduled) {
          console.log("[ensure-schedule] Schedule already set by agent — no enforcement needed");
        } else {
          console.warn("[ensure-schedule] Agent did NOT set refreshIntervalDays — deriving schedule from score");

          // 1. Resolve the org from the agent_run
          const [run] = await db
            .select({ orgId: agentRuns.orgId })
            .from(agentRuns)
            .where(eq(agentRuns.ashSessionId, sessionId))
            .limit(1);

          if (!run?.orgId) {
            console.error("[ensure-schedule] Could not resolve orgId from session — skipping enforcement");
            return;
          }

          // 2. Fetch the org's current opportunityScore and status
          const [org] = await db
            .select({
              opportunityScore: organisations.opportunityScore,
              status: organisations.status,
              nextRunAt: organisations.nextRunAt,
            })
            .from(organisations)
            .where(eq(organisations.id, run.orgId))
            .limit(1);

          if (!org) {
            console.error(`[ensure-schedule] Org ${run.orgId} not found — skipping enforcement`);
            return;
          }

          // If the org is paused or churned, don't schedule
          if (org.status === "paused" || org.status === "churned") {
            console.log(`[ensure-schedule] Org status is "${org.status}" — skipping scheduling`);
            return;
          }

          // If nextRunAt is already set (e.g. by a concurrent hook), don't overwrite
          if (org.nextRunAt) {
            console.log("[ensure-schedule] nextRunAt already set — skipping enforcement");
            return;
          }

          // 3. Derive interval and compute nextRunAt
          const intervalDays = deriveIntervalFromScore(org.opportunityScore);
          const nextRunAt = computeNextRunAt(intervalDays);

          // 4. Write directly to the DB
          await db
            .update(organisations)
            .set({
              refreshIntervalDays: intervalDays,
              nextRunAt,
              lastResearchedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(organisations.id, run.orgId));

          console.log(
            `[ensure-schedule] Enforced schedule for org ${run.orgId}: ` +
              `interval=${intervalDays}d, nextRunAt=${nextRunAt.toISOString()} ` +
              `(derived from score=${org.opportunityScore ?? "null"})`,
          );
        }
      } catch (err) {
        // Enforcement failure must NOT crash the session completion
        console.error(
          `[ensure-schedule] Enforcement failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        // Always clean up session state
        sessionScheduleSet.delete(sessionId);
      }
    },

    /** Clean up on failure too */
    async "session.failed"(_event, ctx) {
      sessionScheduleSet.delete(ctx.session.id);
    },
  },
});

// ── Helpers ──────────────────────────────────────────────────────────────

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
