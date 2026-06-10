import { db } from "@/agent/lib/db/index";
import { agentRuns } from "@/agent/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgId = url.searchParams.get("orgId");

  if (!orgId) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }

  const [activeRun] = await db
    .select({
      id: agentRuns.id,
      status: agentRuns.status,
      ashSessionId: agentRuns.ashSessionId,
      startedAt: agentRuns.startedAt,
    })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.orgId, orgId),
        sql`${agentRuns.status}::text = 'running'`,
      ),
    )
    .limit(1);

  return Response.json({
    hasActiveRun: !!activeRun,
    activeRun: activeRun ?? null,
  });
}
