import { db } from "@/agent/lib/db/index";
import {
  organisations,
  signals,
  tasks,
  agentRuns,
  contacts,
  deals,
} from "@/agent/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import type { Org, Signal, Task, AgentRun, Contact, Deal } from "@/lib/data";
import type { OrgTabData } from "@/components/org-detail-provider";
import { OrgHeader } from "@/components/org-header";
import { OrgTabsClient } from "@/components/org-tabs-client";
import { OrgDetailProvider } from "@/components/org-detail-provider";

export default async function OrgDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; trigger?: string }>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const defaultTab =
    search.tab === "runs"
      ? "runs"
      : search.tab === "contacts"
        ? "contacts"
        : search.tab === "deals"
          ? "deals"
          : search.tab === "chat"
            ? "chat"
            : "overview";
  const shouldTrigger = search.trigger === "1";

  // ── Fetch org ────────────────────────────────────────────────────────

  const [orgRows] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.id, id))
    .limit(1);

  if (!orgRows) {
    return (
      <div className="min-h-screen bg-white">
        <div className="text-center py-20">
          <h2 className="text-lg font-semibold text-notion-text">
            Organisation not found
          </h2>
          <p className="text-sm text-notion-text-muted mt-1">
            The organisation you are looking for does not exist.
          </p>
        </div>
      </div>
    );
  }

  const org: Org = {
    id: orgRows.id,
    name: orgRows.name,
    domain: orgRows.domain,
    hqCountry: orgRows.hqCountry,
    icpDescription: orgRows.icpDescription,
    opportunityScore: orgRows.opportunityScore,
    status: orgRows.status ?? "onboarding",
    lastResearchedAt: orgRows.lastResearchedAt?.toISOString() ?? null,
    nextRunAt: orgRows.nextRunAt?.toISOString() ?? null,
    properties:
      (orgRows.properties as Array<{
        key: string;
        value: string;
        type: string;
      }>) ?? [],
    hasActiveRun: false,
  };

  // ── Fetch all tab data (same as API route) ───────────────────────────

  const [activeRun] = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(and(eq(agentRuns.orgId, id), eq(agentRuns.status, "running")))
    .limit(1);
  org.hasActiveRun = !!activeRun;

  const [signalRows, taskRows, contactRows, runRows] =
    await Promise.all([
      db
        .select()
        .from(signals)
        .where(eq(signals.orgId, id))
        .orderBy(desc(signals.createdAt)),
      db
        .select({ task: tasks, contactName: contacts.name })
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
    ]);

  // Deals table may not exist yet — graceful fallback
  let dealRows: { deal: (typeof deals.$inferSelect); contactName: string | null }[] = [];
  try {
    dealRows = await db
      .select({ deal: deals, contactName: contacts.name })
      .from(deals)
      .where(eq(deals.orgId, id))
      .leftJoin(contacts, eq(deals.primaryContactId, contacts.id))
      .orderBy(desc(deals.createdAt));
  } catch {
    // Table not migrated yet — return empty
  }

  const mappedSignals: Signal[] = signalRows.map((s) => ({
    id: s.id,
    type: s.type,
    title: s.title,
    quotes:
      (s.quotes as Array<{ text: string; speaker?: string; source?: string }>) ??
      [],
    icpRelevance: s.icpRelevance,
    sources:
      (s.sources as Array<{
        url: string;
        title: string;
        publishedDate?: string;
      }>) ?? [],
    impact: s.impact,
    createdAt: s.createdAt.toISOString(),
  }));

  let mappedTasks: Task[] = [];
  try {
    mappedTasks = taskRows.map(({ task: t, contactName }) => ({
      id: t.id,
      type: t.type,
      status: t.status ?? "pending",
      description: t.description,
      rationale: t.rationale,
      priority: t.priority ?? 50,
      contactName: contactName ?? undefined,
      createdAt: t.createdAt.toISOString(),
    }));
  } catch (err) {
    console.error(
      "[org/:id] Failed to map tasks:",
      err instanceof Error ? err.message : err,
    );
  }

  const mappedContacts: Contact[] = contactRows.map((c) => ({
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

  const mappedRuns: AgentRun[] = runRows.map((r) => ({
    id: r.id,
    status: r.status ?? "pending",
    toolsInvoked: r.toolsInvoked ?? 0,
    durationMs: r.durationMs,
    summary: r.summary,
    icpFitScore: r.icpFitScore,
    startedAt: r.startedAt?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  // Initial data for TanStack Query hydration
  const initialData: OrgTabData = {
    hasActiveRun: org.hasActiveRun,
    signals: mappedSignals,
    tasks: mappedTasks,
    contacts: mappedContacts,
    deals: mappedDeals,
    runs: mappedRuns,
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <OrgHeader
        org={org}
        signalCount={mappedSignals.length}
        taskCount={mappedTasks.length}
        contactCount={mappedContacts.length}
      />

      {/* Tabs with TanStack Query hydration */}
      <OrgDetailProvider orgId={org.id} initialData={initialData}>
        <OrgTabsClient
          orgId={org.id}
          orgName={org.name}
          defaultTab={defaultTab}
          triggerRun={shouldTrigger}
          hasActiveRun={org.hasActiveRun}
        />
      </OrgDetailProvider>
    </div>
  );
}
