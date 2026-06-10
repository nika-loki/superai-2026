/**
 * RevenueOS — Capture Trace Hook
 *
 * Ash hook that captures tool calls (actions.requested / action.result)
 * and chain-of-thought reasoning (reasoning.appended / reasoning.completed)
 * and persists them to the agent_runs table in the DB.
 *
 * Hook context provides ctx.session.id which maps to agent_runs.ash_session_id.
 * Tool calls are accumulated in memory and flushed to DB incrementally.
 * Chain-of-thought is accumulated and written on reasoning.completed.
 */

import { defineHook } from "experimental-ash/hooks";
import { eq } from "drizzle-orm";
import { db } from "../lib/db/index";
import { agentRuns } from "../lib/db/schema";

// ── Types ───────────────────────────────────────────────────────────────

interface ToolTrace {
  callId: string;
  toolName: string;
  status: "completed" | "failed" | "running";
  input?: string;
  output?: string;
  startedAt: string;
  completedAt?: string;
}

// ── Per-session accumulator ─────────────────────────────────────────────

const sessionState = new Map<string, {
  tools: ToolTrace[];
  chainOfThought: string;
  runId: string | null;
  flushTimer: ReturnType<typeof setTimeout> | null;
}>();

function getSession(sessionId: string) {
  let state = sessionState.get(sessionId);
  if (!state) {
    state = { tools: [], chainOfThought: "", runId: null, flushTimer: null };
    sessionState.set(sessionId, state);
  }
  return state;
}

// ── DB helpers ──────────────────────────────────────────────────────────

async function lookupRunId(ashSessionId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(eq(agentRuns.ashSessionId, ashSessionId))
    .limit(1);
  return row?.id ?? null;
}

/** Flush current trace data to DB (debounced) */
async function flushToDb(sessionId: string) {
  const state = sessionState.get(sessionId);
  if (!state || !state.runId) return;

  try {
    await db
      .update(agentRuns)
      .set({
        traceData: state.tools,
        toolsInvoked: state.tools.filter((t) => t.status !== "running").length,
        chainOfThought: state.chainOfThought || null,
      })
      .where(eq(agentRuns.id, state.runId));
  } catch (err) {
    console.error(
      `[capture-trace] DB flush failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Debounced flush — waits 500ms to batch rapid events */
function scheduleFlush(sessionId: string) {
  const state = sessionState.get(sessionId);
  if (!state) return;

  if (state.flushTimer) {
    clearTimeout(state.flushTimer);
  }
  state.flushTimer = setTimeout(() => {
    void flushToDb(sessionId);
  }, 500);
}

/** Clean up session state */
function cleanupSession(sessionId: string) {
  const state = sessionState.get(sessionId);
  if (state?.flushTimer) {
    clearTimeout(state.flushTimer);
  }
  sessionState.delete(sessionId);
}

// ── Hook ────────────────────────────────────────────────────────────────

export default defineHook({
  events: {
    /** Resolve run ID from ash_session_id on session start */
    async "session.started"(_event, ctx) {
      const sessionId = ctx.session.id;
      const state = getSession(sessionId);
      if (!state.runId) {
        try {
          state.runId = await lookupRunId(sessionId);
        } catch {
          // Run may not be created yet — will retry on next event
        }
      }
    },

    /** Track tool calls starting */
    async "actions.requested"(event, ctx) {
      const sessionId = ctx.session.id;
      const state = getSession(sessionId);

      // Lazy-resolve run ID if not yet known
      if (!state.runId) {
        try {
          state.runId = await lookupRunId(sessionId);
        } catch {
          // Will retry on next event
        }
      }

      for (const action of event.data.actions) {
        if (action.kind === "tool-call") {
          const rawInput = (action as { input?: unknown }).input;
          state.tools.push({
            callId: action.callId,
            toolName: action.toolName,
            status: "running",
            input: typeof rawInput === "string"
              ? rawInput.slice(0, 500)
              : JSON.stringify(rawInput).slice(0, 500),
            startedAt: new Date().toISOString(),
          });
        }
      }
      scheduleFlush(sessionId);
    },

    /** Track tool results */
    async "action.result"(event, ctx) {
      const sessionId = ctx.session.id;
      const state = getSession(sessionId);
      const result = event.data.result;

      if (result.kind === "tool-result") {
        const tool = state.tools.find((t) => t.callId === result.callId);
        if (tool) {
          tool.status = event.data.status === "failed" ? "failed" : "completed";
          const rawOutput = (result as { output?: unknown }).output;
          tool.output = typeof rawOutput === "string"
            ? rawOutput.slice(0, 500)
            : JSON.stringify(rawOutput).slice(0, 500);
          tool.completedAt = new Date().toISOString();
        }
      }
      scheduleFlush(sessionId);
    },

    /** Accumulate reasoning deltas */
    async "reasoning.appended"(event, ctx) {
      const sessionId = ctx.session.id;
      const state = getSession(sessionId);
      // Use reasoningSoFar to avoid delta accumulation bugs
      state.chainOfThought = event.data.reasoningSoFar;
      scheduleFlush(sessionId);
    },

    /** Finalize reasoning block */
    async "reasoning.completed"(event, ctx) {
      const sessionId = ctx.session.id;
      const state = getSession(sessionId);
      state.chainOfThought = event.data.reasoning;
      // Immediate flush for completed reasoning
      await flushToDb(sessionId);
    },

    /** Flush remaining state and clean up on session end */
    async "session.completed"(_event, ctx) {
      await flushToDb(ctx.session.id);
      cleanupSession(ctx.session.id);
    },

    async "session.failed"(_event, ctx) {
      await flushToDb(ctx.session.id);
      cleanupSession(ctx.session.id);
    },
  },
});
