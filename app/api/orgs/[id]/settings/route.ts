import { db } from "@/agent/lib/db/index";
import { workspaces } from "@/agent/lib/db/schema";
import { eq } from "drizzle-orm";
import { putOrganisationMd } from "@/lib/s3";

/**
 * PATCH /api/orgs/[id]/settings
 *
 * Updates the WORKSPACE's Organisation.md in S3 (the seller's ICP profile).
 * The `id` param is the workspace ID (passed directly from the settings page).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  try {
    const body = await request.json();
    const { organisationMd } = body as { organisationMd?: string };

    if (typeof organisationMd !== "string") {
      return Response.json(
        { error: "organisationMd must be a string" },
        { status: 400 },
      );
    }

    // Verify workspace exists
    const [workspace] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      return Response.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Write to S3 at <workspace_id>/org.md
    await putOrganisationMd(workspaceId, organisationMd);

    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
