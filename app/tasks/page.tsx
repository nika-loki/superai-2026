import { db } from "@/agent/lib/db/index";
import { tasks, organisations, contacts } from "@/agent/lib/db/schema";
import { eq, desc, asc, sql } from "drizzle-orm";
import { TasksPageClient } from "@/components/tasks-page-client";

type TaskStatusType = "pending" | "in_progress" | "completed" | "skipped" | "failed";

type TaskRow = {
  id: string;
  orgId: string | null;
  orgName: string | null;
  orgDomain: string | null;
  type: string | null;
  status: TaskStatusType | null;
  description: string | null;
  rationale: string | null;
  priority: number | null;
  contactName: string | null;
  createdAt: Date | null;
};

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  // Fetch all tasks with their org name and contact name
  const rows = await db
    .select({
      id: tasks.id,
      orgId: tasks.orgId,
      orgName: organisations.name,
      orgDomain: organisations.domain,
      type: tasks.type,
      status: tasks.status,
      description: tasks.description,
      rationale: tasks.rationale,
      priority: tasks.priority,
      contactName: contacts.name,
      createdAt: tasks.createdAt,
    })
    .from(tasks)
    .leftJoin(contacts, eq(tasks.contactId, contacts.id))
    .innerJoin(organisations, eq(tasks.orgId, organisations.id))
    .orderBy(
      sql`CASE ${tasks.status}
        WHEN 'pending' THEN 0
        WHEN 'in_progress' THEN 1
        WHEN 'completed' THEN 2
        WHEN 'skipped' THEN 3
        WHEN 'failed' THEN 4
        ELSE 5 END`,
      desc(tasks.priority),
    );

  // Serialize dates for client component, coerce nulls
  const serialized = rows.map((r: TaskRow) => ({
    ...r,
    status: r.status ?? "pending" as const,
    priority: r.priority ?? 50,
    createdAt: r.createdAt?.toISOString() ?? null,
    orgName: r.orgName ?? "Unknown",
    orgDomain: r.orgDomain ?? "",
  }));

  // Compute summary stats
  const activeCount = rows.filter(
    (r: TaskRow) => r.status === "pending" || r.status === "in_progress",
  ).length;
  const completedCount = rows.filter((r: TaskRow) => r.status === "completed").length;
  const total = rows.length;

  return (
    <TasksPageClient
      tasks={serialized}
      stats={{ active: activeCount, completed: completedCount, total }}
    />
  );
}
