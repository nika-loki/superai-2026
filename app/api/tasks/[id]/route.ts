import { db } from "@/agent/lib/db/index";
import { tasks } from "@/agent/lib/db/schema";
import { eq } from "drizzle-orm";

const VALID_STATUSES = ["pending", "in_progress", "completed", "skipped"] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.status || !VALID_STATUSES.includes(body.status as ValidStatus)) {
    return Response.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(tasks)
    .set({ status: body.status as ValidStatus })
    .where(eq(tasks.id, id))
    .returning({ id: tasks.id, status: tasks.status });

  if (!updated) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  return Response.json(updated);
}
