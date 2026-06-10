import { db } from "@/agent/lib/db/index";
import { tasks } from "@/agent/lib/db/schema";
import { sql } from "drizzle-orm";
import { AppSidebar } from "@/components/app-sidebar";

interface AppShellProps {
  children: React.ReactNode;
}

export async function AppShell({ children }: AppShellProps) {
  let pendingTaskCount = 0;

  try {
    // Count pending tasks for badge
    // Note: cast enum to text for RDS Data API compatibility
    const [pendingRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(sql`${tasks.status}::text = 'pending'`);

    pendingTaskCount = pendingRow?.count ?? 0;
  } catch (err) {
    // During build-time static generation, DB may not be available
    console.warn("[app-shell] DB query failed, using empty defaults:", err instanceof Error ? err.message : String(err));
  }

  return (
    <div className="flex min-h-screen bg-notion-bg">
      <AppSidebar pendingTaskCount={pendingTaskCount} />
      <main className="flex-1 min-w-0 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
