import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/agent/lib/db/index";
import { workspaces } from "@/agent/lib/db/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "@/agent/lib/crypto.js";

const connectSchema = z.object({
  workspaceId: z.string().uuid(),
  portalId: z.string().min(1, "portalId is required"),
  accessToken: z.string().min(1, "accessToken is required"),
});

/**
 * POST /api/hubspot/connect
 *
 * Save encrypted HubSpot credentials for a workspace.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const parsed = connectSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return NextResponse.json(
        { error: "Validation failed", details: errors },
        { status: 400 },
      );
    }

    const { workspaceId, portalId, accessToken } = parsed.data;

    // Verify workspace exists
    const [workspace] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 },
      );
    }

    const encryptedToken = encrypt(accessToken);

    await db
      .update(workspaces)
      .set({
        hubspotIntegration: {
          portalId,
          accessToken: encryptedToken,
          connectedAt: new Date().toISOString(),
          importStatus: "idle",
        },
      })
      .where(eq(workspaces.id, workspaceId));

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[hubspot/connect] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
