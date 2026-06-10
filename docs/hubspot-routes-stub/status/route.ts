import { NextRequest, NextResponse } from "next/server";
import { db } from "@/agent/lib/db/index";
import { workspaces } from "@/agent/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/hubspot/status?workspaceId=uuid
 *
 * Check HubSpot connection status for a workspace.
 * In demo mode (HUBSPOT_API_KEY env var), returns connected=true automatically.
 * Never returns the accessToken in the response.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const envMode = !!process.env["HUBSPOT_API_KEY"];
    const envPortalId = process.env["HUBSPOT_PORTAL_ID"];
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    // In env-var demo mode, return connected without DB lookup
    if (envMode && !workspaceId) {
      return NextResponse.json({
        connected: true,
        portalId: envPortalId ?? null,
        connectedAt: null,
        lastImportAt: null,
        importStatus: "idle",
        errorMessage: null,
        mode: "env",
      });
    }

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId query parameter is required" },
        { status: 400 },
      );
    }

    const [workspace] = await db
      .select({ hubspotIntegration: workspaces.hubspotIntegration })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 },
      );
    }

    const integration = workspace.hubspotIntegration;

    // Env-var mode overrides: always show connected
    if (envMode) {
      return NextResponse.json({
        connected: true,
        portalId: envPortalId ?? integration?.portalId ?? null,
        connectedAt: integration?.connectedAt ?? null,
        lastImportAt: integration?.lastImportAt ?? null,
        importStatus: integration?.importStatus ?? "idle",
        errorMessage: integration?.errorMessage ?? null,
        mode: "env",
      });
    }

    if (!integration) {
      return NextResponse.json({
        connected: false,
        portalId: null,
        connectedAt: null,
        lastImportAt: null,
        importStatus: null,
        errorMessage: null,
      });
    }

    return NextResponse.json({
      connected: true,
      portalId: integration.portalId,
      connectedAt: integration.connectedAt,
      lastImportAt: integration.lastImportAt ?? null,
      importStatus: integration.importStatus ?? null,
      errorMessage: integration.errorMessage ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[hubspot/status] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
