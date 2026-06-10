import { NextResponse } from "next/server";
import { db } from "@/agent/lib/db/index";
import { workspaces } from "@/agent/lib/db/schema";
import { eq, sql } from "drizzle-orm";

const DEMO_WORKSPACE_ID = "10b28180-bd83-4a11-a06c-ff472c1718bd";

export async function POST() {
  try {
    // Ensure the demo workspace exists and has the correct user info
    const [existing] = await db.select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, DEMO_WORKSPACE_ID))
      .limit(1);

    if (!existing) {
      // Create workspace with the known ID
      await db.insert(workspaces).values({
        id: DEMO_WORKSPACE_ID,
        cognitoSub: "demo-user-001",
        name: "Demo User",
        email: "demo@revenueos.app",
      });
      return NextResponse.json({ ok: true, action: "created", name: "Demo User", workspaceId: DEMO_WORKSPACE_ID });
    }

    // Update existing workspace to match correct user info
    await db.update(workspaces).set({
      name: "Demo User",
      email: "demo@revenueos.app",
    }).where(eq(workspaces.id, DEMO_WORKSPACE_ID));

    return NextResponse.json({ ok: true, action: "updated", name: "Demo User", workspaceId: DEMO_WORKSPACE_ID });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
