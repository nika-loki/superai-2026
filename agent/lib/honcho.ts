/**
 * RevenueOS — Honcho Cloud Client
 *
 * Persistent memory for account research agents.
 * Each organisation gets a Honcho peer that accumulates knowledge across runs.
 *
 * Design (per Honcho docs):
 *   - Workspace: one per RevenueOS app (HONCHO_WORKSPACE_ID)
 *   - Peer: one per target account (peerId = orgId)
 *   - Session: one per research run — accumulates all findings from that run
 *   - Recall: session.context({ peerTarget }) returns summary + peer representation
 *   - Store: session.addMessages() to persist findings within the run session
 *
 * Cross-session reasoning works automatically — peer representations accumulate
 * across every session where the peer is included.
 */

import { Honcho, type Peer, type Session } from "@honcho-ai/sdk";

// ---------------------------------------------------------------------------
// Lazy singleton
// ---------------------------------------------------------------------------

let _honcho: Honcho | null = null;

/**
 * Get the Honcho client singleton.
 *
 * Reads HONCHO_API_KEY from the environment.
 * Optionally reads HONCHO_WORKSPACE_ID (defaults to "default").
 */
export function getHonchoClient(): Honcho {
  if (!_honcho) {
    const apiKey = process.env.HONCHO_API_KEY;
    if (!apiKey) {
      throw new Error(
        "[honcho] HONCHO_API_KEY environment variable is required. " +
          "Set it in .env.local or your deployment environment.",
      );
    }

    _honcho = new Honcho({
      apiKey,
      workspaceId: process.env.HONCHO_WORKSPACE_ID ?? "default",
    });

    console.log(
      `[honcho] Client initialised (workspace: ${_honcho.workspaceId})`,
    );
  }
  return _honcho;
}

// ---------------------------------------------------------------------------
// Peer management
// ---------------------------------------------------------------------------

/**
 * Get or create a peer for an organisation (the target account).
 *
 * @param peerId  — stable identifier (e.g. the organisation's DB id)
 * @returns       — the Peer object ready for session operations
 */
export async function ensurePeer(peerId: string): Promise<Peer> {
  const honcho = getHonchoClient();
  const peer = await honcho.peer(peerId);
  console.log(`[honcho] Ensured peer "${peerId}"`);
  return peer;
}

/**
 * Get or create the AI agent peer (the researcher).
 *
 * Set observeMe=false so Honcho doesn't waste compute modelling
 * our deterministic agent behaviour.
 */
export async function ensureAgentPeer(): Promise<Peer> {
  const honcho = getHonchoClient();
  const peer = await honcho.peer("revenueos-agent", {
    configuration: { observeMe: false },
  });
  return peer;
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

// Track the active run session per peer so all writes go to the same session
const activeSessions = new Map<string, Session>();

/**
 * Get or create a session for the current research run.
 *
 * Sessions are scoped per research run (not per memory entry).
 * This ensures Honcho accumulates enough tokens (~1,000+) to trigger reasoning.
 *
 * @param peerId   — the orgId / peerId
 * @param runId    — optional run identifier (creates new session if none active)
 */
export async function getRunSession(
  peerId: string,
  runId?: string,
): Promise<Session> {
  const existing = activeSessions.get(peerId);
  if (existing) return existing;

  const honcho = getHonchoClient();
  const peer = await honcho.peer(peerId);

  const sessionId =
    runId ?? `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const session = await honcho.session(sessionId, {
    peers: peer,
  });

  activeSessions.set(peerId, session);
  console.log(`[honcho] Created run session "${sessionId}" for peer "${peerId}"`);

  return session;
}

/**
 * Clear the active run session for a peer (call at end of research run).
 */
export function clearRunSession(peerId: string): void {
  activeSessions.delete(peerId);
}

// ---------------------------------------------------------------------------
// Memory storage
// ---------------------------------------------------------------------------

/**
 * Store a memory entry for an account within the current run session.
 *
 * Uses the active run session so messages accumulate and Honcho can reason
 * over them together (needs ~1,000 tokens per session for reasoning to fire).
 *
 * @param peerId   — the peer id (organisation id)
 * @param content  — the knowledge to store (free-form text)
 */
export async function storeAccountMemory(
  peerId: string,
  content: string,
): Promise<void> {
  const session = await getRunSession(peerId);
  const peer = await ensurePeer(peerId);

  const msg = peer.message(content);
  await session.addMessages(msg);

  console.log(
    `[honcho] Stored memory for peer "${peerId}" (${content.length} chars)`,
  );
}

/**
 * Store multiple memory entries for an account in the current run session.
 *
 * @param peerId   — the peer id (organisation id)
 * @param entries  — array of content strings to store
 */
export async function storeAccountMemories(
  peerId: string,
  entries: string[],
): Promise<void> {
  if (entries.length === 0) return;

  const session = await getRunSession(peerId);
  const peer = await ensurePeer(peerId);

  const messages = entries.map((content) => peer.message(content));
  await session.addMessages(messages);

  console.log(
    `[honcho] Stored ${entries.length} memory entries for peer "${peerId}"`,
  );
}

// ---------------------------------------------------------------------------
// Memory recall
// ---------------------------------------------------------------------------

/**
 * Recall accumulated knowledge about an account.
 *
 * Uses session.context({ peerTarget }) which returns:
 *   - Summary of the session's messages
 *   - Peer representation (cross-session accumulated knowledge)
 *   - Semantic search results matching the query
 *
 * Reuses the active run session if available, otherwise creates a
 * dedicated recall session (avoids creating many tiny sessions).
 *
 * Falls back to peer.chat() if context() is unavailable.
 *
 * @param peerId  — the peer id (organisation id)
 * @param query   — what to recall (natural language)
 * @returns       — the recalled knowledge as a string
 */
export async function recallAccountMemory(
  peerId: string,
  query: string,
): Promise<string> {
  const honcho = getHonchoClient();
  const peer = await honcho.peer(peerId);

  // Try session.context({ peerTarget }) first — proper cross-session recall
  try {
    // Reuse active run session or create a dedicated recall session
    const existingSession = activeSessions.get(peerId);
    const session = existingSession ?? await getRunSession(peerId, `recall-${peerId}`);

    const context = await session.context({
      peerTarget: peerId,
      tokens: 2000,
      representationOptions: {
        searchQuery: query,
        searchTopK: 10,
        includeMostFrequent: true,
        maxConclusions: 25,
      },
    });

    // Build the recall response from context parts
    const parts: string[] = [];

    if (context.peerRepresentation && context.peerRepresentation.trim()) {
      parts.push(`## Accumulated Account Knowledge\n\n${context.peerRepresentation}`);
    }

    if (context.summary?.content && context.summary.content.trim()) {
      parts.push(`## Session Summary\n\n${context.summary.content}`);
    }

    const result = parts.join("\n\n---\n\n");

    if (result.trim()) {
      console.log(
        `[honcho] Recall via context() for peer "${peerId}" — ${result.length} chars`,
      );
      return result;
    }
  } catch (err) {
    console.warn(
      `[honcho] context() recall failed, falling back to chat: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Fallback: peer.chat() — works but doesn't leverage session context
  try {
    const response = await peer.chat(query, {
      reasoningLevel: "medium",
    });

    console.log(
      `[honcho] Recall via chat() for peer "${peerId}" — ${response != null ? "found" : "null"}`,
    );

    return response ?? "";
  } catch (err) {
    console.error(
      `[honcho] All recall methods failed for peer "${peerId}": ${err instanceof Error ? err.message : String(err)}`,
    );
    return "";
  }
}

// ---------------------------------------------------------------------------
// Representation
// ---------------------------------------------------------------------------

/**
 * Get a peer's accumulated representation — a summary of everything
 * Honcho knows about this peer across all sessions.
 */
export async function getAccountRepresentation(
  peerId: string,
): Promise<string> {
  const honcho = getHonchoClient();
  const peer = await honcho.peer(peerId);

  const representation = await peer.representation();

  console.log(
    `[honcho] Representation for peer "${peerId}" — ${representation.length} chars`,
  );

  return representation;
}
