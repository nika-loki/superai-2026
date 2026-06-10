/**
 * RevenueOS — Parse session context from Ash resolve context
 *
 * Extracts orgId, honchoPeerId, and workspaceId from the session
 * regardless of entry point (frontend, HTTP API, chat).
 *
 * Strategy chain:
 * 1. channel.metadata — works with custom channels that define metadata()
 * 2. Client context messages — from HTTP API clientContext / frontend prepareSend
 * 3. User message — parse orgId from the text (e.g. "The orgId is <uuid>")
 */

import type { DynamicResolveContext } from "experimental-ash/instructions";

interface ParsedContext {
  orgId?: string;
  honchoPeerId?: string;
  workspaceId?: string;
}

/** UUID regex for extracting orgId from text */
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Extract the text content from a model message part */
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (p): p is { type: "text"; text: string } =>
          typeof p === "object" && p !== null && "text" in p && p.type === "text",
      )
      .map((p) => p.text)
      .join(" ");
  }
  return "";
}

export function parseSessionContext(ctx: DynamicResolveContext): ParsedContext {
  // Strategy 1: channel.metadata (custom channels)
  const metadata = ctx.channel.metadata;
  if (metadata && Object.keys(metadata).length > 0) {
    const orgId = metadata.orgId as string | undefined;
    if (orgId) {
      return {
        orgId,
        honchoPeerId: metadata.honchoPeerId as string | undefined,
        workspaceId: metadata.workspaceId as string | undefined,
      };
    }
  }

  // Strategy 2: Parse "Client context:\n{...}" from messages
  const messages = ctx.messages;
  if (messages && Array.isArray(messages)) {
    for (const msg of messages) {
      if (msg.role !== "user") continue;
      const content = extractText(msg.content);
      if (content.startsWith("Client context:\n")) {
        try {
          const json = JSON.parse(content.replace("Client context:\n", ""));
          if (json.orgId || json.honchoPeerId) {
            return {
              orgId: json.orgId,
              honchoPeerId: json.honchoPeerId,
              workspaceId: json.workspaceId,
            };
          }
        } catch {
          // Not JSON — fall through
        }
      }
    }

    // Strategy 3: Parse orgId from user messages
    for (const msg of messages) {
      if (msg.role !== "user") continue;
      const content = extractText(msg.content);
      // Look for "orgId is <uuid>" or just a UUID in the message
      const orgIdMatch =
        content.match(/orgId\s+(?:is\s+)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i) ??
        (content.includes("Client context:") ? null : content.match(UUID_RE));
      if (orgIdMatch?.[1]) {
        return { orgId: orgIdMatch[1] };
      }
    }
  }

  return {};
}
