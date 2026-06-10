import { db } from "@/agent/lib/db/index";
import {
  signals,
  tasks,
  agentRuns,
  contacts,
  deals,
} from "@/agent/lib/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import type { Signal, Task, AgentRun, Contact, Deal } from "@/lib/data";
import { RequestTimer } from "@/agent/lib/db/timing";

type SignalRow = typeof signals.$inferSelect;
type TaskRow = typeof tasks.$inferSelect;
type ContactRow = typeof contacts.$inferSelect;
type AgentRunRow = typeof agentRuns.$inferSelect;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const timer = new RequestTimer("api:org-detail");

  // Merge active-run-check into the parallel batch (all only need orgId)
  const [activeRunRows, signalRows, taskRows, contactRows, runRows] =
    await timer.timed("parallel-all-data", () =>
      Promise.all([
        db
          .select({ id: agentRuns.id })
          .from(agentRuns)
          .where(and(eq(agentRuns.orgId, id), sql`${agentRuns.status}::text = 'running'`))
          .limit(1),
        db
          .select()
          .from(signals)
          .where(eq(signals.orgId, id))
          .orderBy(desc(signals.createdAt)),
        db
          .select({
            task: tasks,
            contactName: contacts.name,
          })
          .from(tasks)
          .where(eq(tasks.orgId, id))
          .leftJoin(contacts, eq(tasks.contactId, contacts.id))
          .orderBy(desc(tasks.priority)),
        db
          .select()
          .from(contacts)
          .where(eq(contacts.orgId, id))
          .orderBy(desc(contacts.discoveredAt)),
        db
          .select()
          .from(agentRuns)
          .where(eq(agentRuns.orgId, id))
          .orderBy(desc(agentRuns.createdAt)),
      ]),
    );
  const activeRun = activeRunRows[0];

  // Deals table may not exist yet — graceful fallback
  let dealRows: { deal: (typeof deals.$inferSelect); contactName: string | null }[] = [];
  try {
    dealRows = await timer.timed("fetch-deals", () =>
      db
        .select({ deal: deals, contactName: contacts.name })
        .from(deals)
        .where(eq(deals.orgId, id))
        .leftJoin(contacts, eq(deals.primaryContactId, contacts.id))
        .orderBy(desc(deals.createdAt)),
    );
  } catch {
    // Table not migrated yet — return empty
  }

  const mappedSignals: Signal[] = signalRows.map((s: SignalRow) => ({
    id: s.id,
    type: s.type,
    title: s.title,
    quotes:
      (s.quotes as Array<{ text: string; speaker?: string; source?: string }>) ??
      [],
    icpRelevance: s.icpRelevance,
    sources:
      (s.sources as Array<{ url: string; title: string; publishedDate?: string }>) ??
      [],
    impact: s.impact,
    createdAt: s.createdAt.toISOString(),
  }));

  const mappedTasks: Task[] = taskRows.map(({ task: t, contactName }: { task: TaskRow; contactName: string | null }) => ({
    id: t.id,
    type: t.type,
    status: t.status ?? "pending",
    description: t.description,
    rationale: t.rationale,
    priority: t.priority ?? 50,
    contactName: contactName ?? undefined,
    createdAt: t.createdAt.toISOString(),
  }));

  const mappedContacts: Contact[] = contactRows.map((c: ContactRow) => ({
    id: c.id,
    name: c.name,
    title: c.title,
    linkedinUrl: c.linkedinUrl,
    email: c.email,
    seniority: c.seniority ?? "unknown",
    relevanceNote: c.relevanceNote,
  }));

  const mappedDeals: Deal[] = dealRows.map(({ deal: d, contactName }) => ({
    id: d.id,
    title: d.title,
    description: d.description,
    stage: d.stage ?? "discovery",
    valueUsd: d.valueUsd,
    expectedCloseDate: d.expectedCloseDate?.toISOString() ?? null,
    probability: d.probability ?? 20,
    primaryContactName: contactName ?? null,
    createdAt: d.createdAt.toISOString(),
  }));

  const mappedRuns: AgentRun[] = runRows.map((r: AgentRunRow) => ({
    id: r.id,
    status: r.status ?? "pending",
    toolsInvoked: r.toolsInvoked ?? 0,
    traceData:
      (r.traceData as Array<{ callId: string; toolName: string; status: "completed" | "failed" | "running"; input?: string; output?: string; startedAt?: string; completedAt?: string }>) ??
      [],
    chainOfThought: r.chainOfThought ?? null,
    durationMs: r.durationMs,
    summary: r.summary,
    icpFitScore: r.icpFitScore,
    startedAt: r.startedAt?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  const report = timer.toReport();
  console.log("[perf] api:org-detail:", JSON.stringify(report));

  return new Response(
    JSON.stringify({
      hasActiveRun: !!activeRun,
      signals: mappedSignals,
      tasks: mappedTasks,
      contacts: mappedContacts,
      deals: mappedDeals,
      runs: mappedRuns,
      _perf: report,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Server-Timing": timer.toServerTimingHeader(),
        // Allow browser to cache for 5s — reduces redundant DB hits during TanStack Query polling
        "Cache-Control": "private, max-age=5, stale-while-revalidate=10",
      },
    },
  );
}
