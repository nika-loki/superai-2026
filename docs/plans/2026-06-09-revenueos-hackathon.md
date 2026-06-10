# RevenueOS Hackathon Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build and deploy an autonomous account research agent that demos live on the WEKA stage at SuperAI hackathon.

**Architecture:** Single Ash agent on Vercel with 9 tools (Exa search, Drizzle persistence, Honcho memory), Next.js 15 dashboard, Aurora RDS for data, Stripe for billing. Self-scheduling via cron.

**Tech Stack:** experimental-ash, ai@canary, zod, Next.js 15, Shadcn UI, Drizzle ORM, Aurora RDS, S3, Cognito, Stripe, Exa API, Honcho Cloud

---

## Phase 1: Foundation (Tasks 1–5)

> Get the app booting locally with correct schema, config, and DB connection.

### Task 1: Fix next.config.ts with withAsh()

**Files:**
- Create: `next.config.ts`

**Step 1: Write next.config.ts**

```ts
import type { NextConfig } from "next";
import { withAsh } from "experimental-ash/next";

const nextConfig: NextConfig = {};

export default withAsh(nextConfig);
```

**Step 2: Verify dev server boots**

Run: `pnpm dev`
Expected: Both Next.js and Ash dev server start without errors

**Step 3: Commit**

```bash
git add next.config.ts
git commit -m "feat: add next.config.ts with withAsh() wrapper"
```

---

### Task 2: Rewrite agent/agent.ts with correct model

**Files:**
- Modify: `agent/agent.ts`

**Step 1: Update agent entry point**

```ts
import { defineAgent } from "experimental-ash";

export default defineAgent({
  model: "anthropic/claude-sonnet-4-20250514",
});
```

**Step 2: Verify**

Run: `pnpm dev`
Expected: Agent starts, model resolved via AI Gateway

**Step 3: Commit**

```bash
git add agent/agent.ts
git commit -m "feat(agent): set model to claude-sonnet-4 via AI Gateway"
```

---

### Task 3: Rewrite agent/db/schema.ts — locked 6 tables

**Files:**
- Modify: `agent/db/schema.ts` (full rewrite)
- Create: `agent/lib/db/schema.ts` (re-export)

**Step 1: Write the schema**

Replace entire `agent/db/schema.ts` with:

```ts
/**
 * RevenueOS — Database Schema (6 Tables)
 *
 * Locked decisions: 6 tables, 5 enums, UUID PKs, timestamptz everywhere.
 * Signal types are dynamic text from ICP — NOT an enum.
 */

import {
  pgEnum,
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { sql } from "drizzle-orm/sql";

// ── Enums (5 total) ────────────────────────────────────────────────

export const orgStatusEnum = pgEnum("org_status", [
  "onboarding",
  "active",
  "paused",
  "churned",
]);

export const runStatusEnum = pgEnum("run_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const seniorityEnum = pgEnum("seniority", [
  "c_suite",
  "vp",
  "director",
  "manager",
  "individual",
  "unknown",
]);

export const taskTypeEnum = pgEnum("task_type", [
  "send_email",
  "send_linkedin_dm",
  "schedule_call",
  "research_deeper",
  "notify_user",
  "other",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "in_progress",
  "completed",
  "skipped",
  "failed",
]);

// ── Helpers ────────────────────────────────────────────────────────

const now = () => timestamp({ withTimezone: true }).defaultNow().notNull();
const nullableTz = () => timestamp({ withTimezone: true });

// ── Tables ─────────────────────────────────────────────────────────

/** 1. workspaces — multi-tenant scope, Cognito sub */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  cognitoSub: text("cognito_sub").notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: now(),
}, (t) => [
  index("workspaces_email_idx").on(t.email),
]);

/** 2. organisations — target account + agent identity */
export const organisations = pgTable("organisations", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  hqCountry: text("hq_country").notNull(),
  icpDescription: text("icp_description").notNull(),
  onboardingFiles: jsonb("onboarding_files").$type<Array<{
    url: string; filename: string; uploadedAt: string;
  }>>(),
  opportunityScore: integer("opportunity_score"),
  lastResearchedAt: nullableTz(),
  nextRunAt: nullableTz(),
  refreshIntervalDays: integer("refresh_interval_days"),
  honchoPeerId: text("honcho_peer_id").unique(),
  status: orgStatusEnum("status").default("onboarding"),
  onboardingMetadata: jsonb("onboarding_metadata")
    .$type<Record<string, unknown>>(),
  createdAt: now(),
  updatedAt: now(),
}, (t) => [
  uniqueIndex("orgs_domain_workspace_idx").on(t.domain, t.workspaceId),
  index("orgs_workspace_id_idx").on(t.workspaceId),
  index("orgs_status_idx").on(t.status),
  index("orgs_next_run_at_idx").on(t.nextRunAt)
    .where(sql`${t.nextRunAt} IS NOT NULL`),
]);

/** 3. agent_runs — execution history */
export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull()
    .references(() => organisations.id, { onDelete: "cascade" }),
  ashSessionId: text("ash_session_id"),
  status: runStatusEnum("status").default("pending"),
  toolsInvoked: integer("tools_invoked").default(0),
  durationMs: integer("duration_ms"),
  tokensUsed: integer("tokens_used"),
  summary: text("summary"),
  icpFitScore: integer("icp_fit_score"),
  recommendedActions: jsonb("recommended_actions").$type<Array<{
    action: string; priority: number; rationale: string;
  }>>(),
  errorDetails: jsonb("error_details").$type<{
    message: string; toolName?: string; stackTrace?: string;
  }>(),
  startedAt: nullableTz(),
  completedAt: nullableTz(),
  createdAt: now(),
}, (t) => [
  index("runs_org_created_idx").on(t.orgId, t.createdAt),
  index("runs_status_idx").on(t.status),
]);

/** 4. contacts — discovered people */
export const contacts = pgTable("contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull()
    .references(() => organisations.id, { onDelete: "cascade" }),
  agentRunId: uuid("agent_run_id")
    .references((): AnyPgColumn => agentRuns.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  title: text("title"),
  linkedinUrl: text("linkedin_url"),
  email: text("email"),
  seniority: seniorityEnum("seniority").default("unknown"),
  source: text("source").default("exa"),
  relevanceNote: text("relevance_note"),
  discoveredAt: now(),
}, (t) => [
  uniqueIndex("contacts_org_linkedin_idx").on(t.orgId, t.linkedinUrl),
]);

/** 5. signals — dynamic intelligence events */
export const signals = pgTable("signals", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull()
    .references(() => organisations.id, { onDelete: "cascade" }),
  agentRunId: uuid("agent_run_id")
    .references((): AnyPgColumn => agentRuns.id, { onDelete: "set null" }),
  contactId: uuid("contact_id")
    .references(() => contacts.id, { onDelete: "set null" }),
  type: text("type").notNull(), // dynamic, NOT enum
  title: text("title").notNull(),
  quotes: jsonb("quotes").notNull()
    .$type<Array<{ text: string; speaker?: string; source?: string }>>(),
  icpRelevance: text("icp_relevance").notNull(),
  sources: jsonb("sources").notNull()
    .$type<Array<{ url: string; title: string; publishedDate?: string }>>(),
  impact: integer("impact"),
  createdAt: now(),
}, (t) => [
  index("signals_org_id_idx").on(t.orgId),
]);

/** 6. tasks — engagement actions */
export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull()
    .references(() => organisations.id, { onDelete: "cascade" }),
  agentRunId: uuid("agent_run_id")
    .references((): AnyPgColumn => agentRuns.id, { onDelete: "set null" }),
  contactId: uuid("contact_id")
    .references(() => contacts.id, { onDelete: "set null" }),
  type: taskTypeEnum("type").notNull(),
  status: taskStatusEnum("status").default("pending"),
  description: text("description").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  rationale: text("rationale"),
  priority: integer("priority").default(50),
  executedAt: nullableTz(),
  result: text("result"),
  createdAt: now(),
  updatedAt: now(),
}, (t) => [
  index("tasks_org_id_idx").on(t.orgId),
  index("tasks_status_idx").on(t.orgId, t.status),
]);

// ── Relations ──────────────────────────────────────────────────────

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  organisations: many(organisations),
}));

export const organisationsRelations = relations(organisations, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [organisations.workspaceId],
    references: [workspaces.id],
  }),
  agentRuns: many(agentRuns),
  contacts: many(contacts),
  signals: many(signals),
  tasks: many(tasks),
}));

export const agentRunsRelations = relations(agentRuns, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [agentRuns.orgId], references: [organisations.id],
  }),
  contacts: many(contacts),
  signals: many(signals),
  tasks: many(tasks),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [contacts.orgId], references: [organisations.id],
  }),
  agentRun: one(agentRuns, {
    fields: [contacts.agentRunId], references: [agentRuns.id],
  }),
  signals: many(signals),
  tasks: many(tasks),
}));

export const signalsRelations = relations(signals, ({ one }) => ({
  organisation: one(organisations, {
    fields: [signals.orgId], references: [organisations.id],
  }),
  agentRun: one(agentRuns, {
    fields: [signals.agentRunId], references: [agentRuns.id],
  }),
  contact: one(contacts, {
    fields: [signals.contactId], references: [contacts.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  organisation: one(organisations, {
    fields: [tasks.orgId], references: [organisations.id],
  }),
  agentRun: one(agentRuns, {
    fields: [tasks.agentRunId], references: [agentRuns.id],
  }),
  contact: one(contacts, {
    fields: [tasks.contactId], references: [contacts.id],
  }),
}));
```

**Step 2: Create re-export**

```ts
// agent/lib/db/schema.ts
export * from "../../db/schema.js";
```

**Step 3: Commit**

```bash
git add agent/db/schema.ts agent/lib/db/schema.ts
git commit -m "feat(db): rewrite schema to locked 6 tables with 5 enums"
```

---

### Task 4: Create DB client (agent/lib/db.ts)

**Files:**
- Create: `agent/lib/db.ts`

**Step 1: Write Drizzle client**

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
```

**Step 2: Install pg dependency**

```bash
pnpm add drizzle-orm pg
pnpm add -D @types/pg
```

**Step 3: Commit**

```bash
git add agent/lib/db.ts package.json pnpm-lock.yaml
git commit -m "feat(db): add Drizzle client with pg connection pool"
```

---

### Task 5: Write agent/instructions.md

**Files:**
- Modify: `agent/instructions.md`

**Step 1: Write agent system prompt**

Replace the placeholder with the full RevenueOS agent instructions covering:
- Agent identity (RevenueOS account researcher)
- Research methodology (recall → search → persist → remember → schedule)
- Tool usage guidelines for all 9 tools
- ICP scoring rules (0-100)
- Refresh interval logic (3/14/30 days based on fit)
- Output format expectations

**Step 2: Commit**

```bash
git add agent/instructions.md
git commit -m "feat(agent): write RevenueOS system prompt"
```

---

## Phase 2: Agent Tools (Tasks 6–14)

> Build all 9 tools. Each tool is one task: implement → verify → commit.
> For hackathon speed, skip unit tests on tools — verify by running the agent.

### Task 6: exa_people_search tool

**Files:**
- Create: `agent/tools/exa-people-search.ts`
- Create: `agent/lib/exa.ts` (Exa client)

**Step 1: Create Exa client**

```ts
// agent/lib/exa.ts
// Exa API client — neural search for people, companies, events
// Uses fetch directly against https://api.exa.ai/search

const EXA_BASE = "https://api.exa.ai";

export async function exaSearch(query: string, opts: {
  type?: "neural" | "keyword";
  numResults?: number;
  includeDomains?: string[];
  contents?: { text: boolean };
  category?: string;
}) {
  const res = await fetch(`${EXA_BASE}/search`, {
    method: "POST",
    headers: {
      "x-api-key": process.env.EXA_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, ...opts }),
  });
  if (!res.ok) throw new Error(`Exa API error: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function exaFindPeople(
  companyName: string,
  titles: string[],
  country?: string,
) {
  const query = `${companyName} ${titles.join(" ")} ${country ?? ""} site:linkedin.com/in`;
  return exaSearch(query, {
    type: "neural",
    numResults: 10,
    contents: { text: true },
  });
}
```

**Step 2: Create tool**

```ts
// agent/tools/exa-people-search.ts
import { defineTool } from "experimental-ash";
import { z } from "zod";
import { exaFindPeople } from "../lib/exa.js";

export default defineTool({
  name: "exa_people_search",
  description: "Find ICP-matching people at a target company. Returns names, titles, LinkedIn URLs, seniority.",
  parameters: z.object({
    companyName: z.string().describe("Target company name"),
    titles: z.array(z.string()).describe("Job titles to search for (e.g. ['CTO', 'VP Engineering'])"),
    country: z.string().optional().describe("Country to scope search (e.g. 'Singapore')"),
  }),
  execute: async ({ companyName, titles, country }) => {
    const results = await exaFindPeople(companyName, titles, country);
    // Parse results into structured contact data
    return results.results?.map((r: any) => ({
      name: r.title ?? "",
      linkedinUrl: r.url ?? "",
      title: r.text?.slice(0, 200) ?? "",
      source: "exa",
    })) ?? [];
  },
});
```

**Step 3: Commit**

```bash
git add agent/tools/exa-people-search.ts agent/lib/exa.ts
git commit -m "feat(agent): add exa_people_search tool"
```

---

### Task 7: exa_company_signals tool

**Files:**
- Create: `agent/tools/exa-company-signals.ts`

**Step 1: Create tool**

```ts
// agent/tools/exa-company-signals.ts
import { defineTool } from "experimental-ash";
import { z } from "zod";
import { exaSearch } from "../lib/exa.js";

export default defineTool({
  name: "exa_company_signals",
  description: "Detect company-level signals (funding, expansion, leadership changes, technology adoption). Signal types are dynamic from ICP — not a fixed enum.",
  parameters: z.object({
    companyName: z.string().describe("Target company name"),
    domain: z.string().describe("Company domain"),
    icpDescription: z.string().describe("ICP fit description to guide signal search"),
  }),
  execute: async ({ companyName, domain, icpDescription }) => {
    // Search for multiple signal categories
    const queries = [
      `${companyName} funding OR investment OR series`,
      `${companyName} leadership OR "new CEO" OR "new CTO" OR appointed`,
      `${companyName} expansion OR "new office" OR launch`,
      `${companyName} ${icpDescription.slice(0, 100)}`,
    ];

    const allResults = await Promise.all(
      queries.map((q) =>
        exaSearch(q, {
          type: "neural",
          numResults: 5,
          includeDomains: [domain],
          contents: { text: true },
        }).catch(() => ({ results: [] }))
      ),
    );

    return allResults.flatMap((r) => r.results ?? []);
  },
});
```

**Step 2: Commit**

```bash
git add agent/tools/exa-company-signals.ts
git commit -m "feat(agent): add exa_company_signals tool"
```

---

### Task 8: exa_event_research tool

**Files:**
- Create: `agent/tools/exa-event-research.ts`

**Step 1: Create tool**

```ts
// agent/tools/exa-event-research.ts
import { defineTool } from "experimental-ash";
import { z } from "zod";
import { exaSearch } from "../lib/exa.js";

export default defineTool({
  name: "exa_event_research",
  description: "Discover industry events, conferences, and speaking engagements related to the target account.",
  parameters: z.object({
    companyName: z.string().describe("Target company name"),
    industry: z.string().optional().describe("Industry vertical (e.g. 'fintech', 'SaaS')"),
    country: z.string().optional().describe("Country scope"),
  }),
  execute: async ({ companyName, industry, country }) => {
    const query = `${companyName} ${industry ?? ""} conference OR summit OR event OR speaking ${country ?? ""}`;
    return exaSearch(query, {
      type: "neural",
      numResults: 8,
      contents: { text: true },
    });
  },
});
```

**Step 2: Commit**

```bash
git add agent/tools/exa-event-research.ts
git commit -m "feat(agent): add exa_event_research tool"
```

---

### Task 9: db_write_contacts tool

**Files:**
- Create: `agent/tools/db-write-contacts.ts`

**Step 1: Create tool**

```ts
// agent/tools/db-write-contacts.ts
import { defineTool } from "experimental-ash";
import { z } from "zod";
import { db } from "../lib/db.js";
import { contacts } from "../lib/db/schema.js";

export default defineTool({
  name: "db_write_contacts",
  description: "Persist discovered contacts to Aurora RDS. Deduplicates by (orgId, linkedinUrl).",
  parameters: z.object({
    orgId: z.string().uuid(),
    agentRunId: z.string().uuid().optional(),
    contacts: z.array(z.object({
      name: z.string(),
      title: z.string().optional(),
      linkedinUrl: z.string().optional(),
      email: z.string().optional(),
      seniority: z.enum(["c_suite", "vp", "director", "manager", "individual", "unknown"]).optional(),
      relevanceNote: z.string().optional(),
    })),
  }),
  execute: async ({ orgId, agentRunId, contacts: contactList }) => {
    const rows = contactList.map((c) => ({
      orgId,
      agentRunId: agentRunId ?? null,
      name: c.name,
      title: c.title ?? null,
      linkedinUrl: c.linkedinUrl ?? null,
      email: c.email ?? null,
      seniority: c.seniority ?? "unknown",
      relevanceNote: c.relevanceNote ?? null,
    }));
    // Insert with ON CONFLICT DO NOTHING on (orgId, linkedinUrl)
    const result = await db.insert(contacts).values(rows)
      .onConflictDoNothing().returning();
    return { inserted: result.length, total: contactList.length };
  },
});
```

**Step 2: Commit**

```bash
git add agent/tools/db-write-contacts.ts
git commit -m "feat(agent): add db_write_contacts tool"
```

---

### Task 10: db_write_signals tool

**Files:**
- Create: `agent/tools/db-write-signals.ts`

**Step 1: Create tool**

```ts
// agent/tools/db-write-signals.ts
import { defineTool } from "experimental-ash";
import { z } from "zod";
import { db } from "../lib/db.js";
import { signals } from "../lib/db/schema.js";

export default defineTool({
  name: "db_write_signals",
  description: "Persist detected signals with dynamic type, quotes, ICP relevance, and multi-source URLs.",
  parameters: z.object({
    orgId: z.string().uuid(),
    agentRunId: z.string().uuid().optional(),
    signals: z.array(z.object({
      type: z.string().describe("Dynamic signal type from ICP (e.g. 'funding_round', 'leadership_change')"),
      title: z.string(),
      quotes: z.array(z.object({
        text: z.string(),
        speaker: z.string().optional(),
        source: z.string().optional(),
      })),
      icpRelevance: z.string().describe("Why this signal matters for the user's ICP"),
      sources: z.array(z.object({
        url: z.string(),
        title: z.string(),
        publishedDate: z.string().optional(),
      })),
      impact: z.number().min(1).max(5).optional(),
      contactId: z.string().uuid().optional(),
    })),
  }),
  execute: async ({ orgId, agentRunId, signals: signalList }) => {
    const rows = signalList.map((s) => ({
      orgId,
      agentRunId: agentRunId ?? null,
      contactId: s.contactId ?? null,
      type: s.type,
      title: s.title,
      quotes: s.quotes,
      icpRelevance: s.icpRelevance,
      sources: s.sources,
      impact: s.impact ?? null,
    }));
    const result = await db.insert(signals).values(rows).returning();
    return { inserted: result.length };
  },
});
```

**Step 2: Commit**

```bash
git add agent/tools/db-write-signals.ts
git commit -m "feat(agent): add db_write_signals tool"
```

---

### Task 11: db_write_research_log tool

**Files:**
- Create: `agent/tools/db-write-research-log.ts`

**Step 1: Create tool**

```ts
// agent/tools/db-write-research-log.ts
import { defineTool } from "experimental-ash";
import { z } from "zod";
import { db } from "../lib/db.js";
import { agentRuns } from "../lib/db/schema.js";
import { eq } from "drizzle-orm";

export default defineTool({
  name: "db_write_research_log",
  description: "Update agent_runs record with summary, ICP fit score, and recommended actions after research completes.",
  parameters: z.object({
    runId: z.string().uuid(),
    summary: z.string(),
    icpFitScore: z.number().min(0).max(100),
    recommendedActions: z.array(z.object({
      action: z.string(),
      priority: z.number(),
      rationale: z.string(),
    })).optional(),
    toolsInvoked: z.number().optional(),
    durationMs: z.number().optional(),
    tokensUsed: z.number().optional(),
  }),
  execute: async ({ runId, ...updates }) => {
    const [updated] = await db.update(agentRuns)
      .set({
        ...updates,
        status: "completed",
        completedAt: new Date(),
      })
      .where(eq(agentRuns.id, runId))
      .returning();
    return updated;
  },
});
```

**Step 2: Commit**

```bash
git add agent/tools/db-write-research-log.ts
git commit -m "feat(agent): add db_write_research_log tool"
```

---

### Task 12: db_update_org tool

**Files:**
- Create: `agent/tools/db-update-org.ts`

**Step 1: Create tool**

```ts
// agent/tools/db-update-org.ts
import { defineTool } from "experimental-ash";
import { z } from "zod";
import { db } from "../lib/db.js";
import { organisations } from "../lib/db/schema.js";
import { eq } from "drizzle-orm";

export default defineTool({
  name: "db_update_org",
  description: "Update organisation record: opportunityScore, nextRunAt, refreshIntervalDays, status.",
  parameters: z.object({
    orgId: z.string().uuid(),
    opportunityScore: z.number().min(0).max(100).optional(),
    refreshIntervalDays: z.number().describe("Days until next research run (3 for strong fit, 14 for moderate, 30 for poor)"),
    status: z.enum(["onboarding", "active", "paused", "churned"]).optional(),
  }),
  execute: async ({ orgId, opportunityScore, refreshIntervalDays, status }) => {
    const now = new Date();
    const nextRunAt = new Date(now.getTime() + refreshIntervalDays * 24 * 60 * 60 * 1000);
    const [updated] = await db.update(organisations)
      .set({
        opportunityScore,
        refreshIntervalDays,
        nextRunAt,
        lastResearchedAt: now,
        status: status ?? "active",
        updatedAt: now,
      })
      .where(eq(organisations.id, orgId))
      .returning();
    return updated;
  },
});
```

**Step 2: Commit**

```bash
git add agent/tools/db-update-org.ts
git commit -m "feat(agent): add db_update_org tool"
```

---

### Task 13: honcho_remember tool

**Files:**
- Create: `agent/tools/honcho-remember.ts`
- Create: `agent/lib/honcho.ts` (Honcho client)

**Step 1: Create Honcho client**

```ts
// agent/lib/honcho.ts
import Honcho from "@honcho-ai/sdk";

export function getHonchoClient() {
  return new Honcho({ apiKey: process.env.HONCHO_API_KEY });
}

export async function getOrCreatePeer(peerId: string) {
  const client = getHonchoClient();
  // Ensure peer exists, then return it
  return client.peer(peerId);
}
```

**Step 2: Create tool**

```ts
// agent/tools/honcho-remember.ts
import { defineTool } from "experimental-ash";
import { z } from "zod";
import { getHonchoClient } from "../lib/honcho.js";

export default defineTool({
  name: "honcho_remember",
  description: "Store findings in Honcho memory for this account. Accumulates across all research runs.",
  parameters: z.object({
    peerId: z.string().describe("Organisation's Honcho peer ID"),
    content: z.string().describe("Key findings and learnings to remember"),
  }),
  execute: async ({ peerId, content }) => {
    const client = getHonchoClient();
    const peer = client.peer(peerId);
    const session = await peer.session();
    await session.addMessage({ content, role: "assistant" });
    return { remembered: true, peerId };
  },
});
```

**Step 3: Install dependency**

```bash
pnpm add @honcho-ai/sdk
```

**Step 4: Commit**

```bash
git add agent/tools/honcho-remember.ts agent/lib/honcho.ts package.json pnpm-lock.yaml
git commit -m "feat(agent): add honcho_remember tool"
```

---

### Task 14: honcho_recall tool

**Files:**
- Create: `agent/tools/honcho-recall.ts`

**Step 1: Create tool**

```ts
// agent/tools/honcho-recall.ts
import { defineTool } from "experimental-ash";
import { z } from "zod";
import { getHonchoClient } from "../lib/honcho.js";

export default defineTool({
  name: "honcho_recall",
  description: "Retrieve accumulated knowledge from all prior research runs on this account.",
  parameters: z.object({
    peerId: z.string().describe("Organisation's Honcho peer ID"),
    query: z.string().describe("What to recall about this account"),
  }),
  execute: async ({ peerId, query }) => {
    const client = getHonchoClient();
    const peer = client.peer(peerId);
    const response = await peer.chat(query);
    return response;
  },
});
```

**Step 2: Commit**

```bash
git add agent/tools/honcho-recall.ts
git commit -m "feat(agent): add honcho_recall tool"
```

---

## Phase 3: Skills + Schedule (Tasks 15–20)

> Agent skills (market knowledge, prospecting, onboarding) and the cron schedule.

### Task 15: Singapore market skill (hero demo skill)

**Files:**
- Create: `agent/skills/markets/singapore/SKILL.md`

**Step 1: Write skill**

```markdown
# Singapore Market Intelligence

You are researching a company headquartered in Singapore.

## Market Context
- Business hub for Southeast Asia, English-speaking business environment
- Key industries: FinTech, SaaS, Logistics, E-commerce, Digital Banking
- Government incentives: MAS fintech sandbox, EDB grants, Startup SG
- Common seniority titles: Managing Director, Head of, VP, Director

## Research Parameters
- Search in English, scope to Singapore and regional expansion
- Look for: MAS licenses, regional HQ expansions, GIC/Temasek investments
- LinkedIn titles: "Head of Engineering", "CTO", "VP Product", "Chief Digital Officer"
- Events: Singapore FinTech Festival, Tech in Asia, Echelon, SLINGSHOT

## Signal Types to Detect
- MAS regulatory approval/new license
- Regional expansion (Indonesia, Thailand, Vietnam, Philippines)
- Government partnership or grant
- Enterprise client wins in SEA
- Leadership hires from global tech companies
```

**Step 2: Commit**

```bash
git add agent/skills/markets/singapore/SKILL.md
git commit -m "feat(skills): add Singapore market skill"
```

---

### Task 16: Prospecting skill

**Files:**
- Create: `agent/skills/prospecting/SKILL.md`

**Step 1: Write skill**

```markdown
# Prospecting & ICP Matching

## ICP Scoring Rules (0-100)
- 90-100: Perfect fit. Exact industry, right size, active buying signals, champion identified.
- 70-89: Strong fit. Close industry, right region, 2+ signals, senior stakeholder found.
- 50-69: Moderate fit. Adjacent industry or size, 1 signal, contacts but no champion.
- 0-49: Poor fit. Wrong segment, no signals, generic contacts only.

## Contact Prioritization
1. C-suite with ICP-relevant background (highest priority)
2. VP/Director in target function (engineering, product, data)
3. Senior managers with decision influence
4. Individual contributors (only if highly relevant to ICP)

## Signal Detection
- Each signal must include: type (dynamic from ICP), title, at least 1 quote, ICP relevance reasoning
- Multi-source signals are stronger than single-source
- Recent signals (< 30 days) are weighted higher

## Output Format
- Every contact gets a relevanceNote explaining why they matter
- Every signal gets icpRelevance with 3 reasons
- Recommended tasks must include rationale
```

**Step 2: Commit**

```bash
git add agent/skills/prospecting/SKILL.md
git commit -m "feat(skills): add prospecting skill"
```

---

### Task 17: Onboarding research skill

**Files:**
- Create: `agent/skills/onboarding-research/SKILL.md`

**Step 1: Write skill**

```markdown
# First-Run Research Procedure

When researching an organisation for the first time:

## Step 1: Recall Prior Knowledge
- Call honcho_recall with the org's peerId
- If no prior knowledge exists, this is a cold start

## Step 2: Load Market Context
- Read the skill for the org's hqCountry
- Apply market-specific search parameters

## Step 3: Execute Searches (in parallel when possible)
1. exa_people_search — Find 5-10 ICP-matching contacts
2. exa_company_signals — Detect 3-5 company-level signals
3. exa_event_research — Find 2-3 relevant events

## Step 4: Persist All Results
1. db_write_contacts — Save all discovered contacts
2. db_write_signals — Save all detected signals with quotes and ICP relevance

## Step 5: Update Organisation
1. db_update_org — Set opportunityScore, refreshIntervalDays, status="active"
   - Score >= 70: refreshIntervalDays = 3
   - Score 50-69: refreshIntervalDays = 14
   - Score < 50: refreshIntervalDays = 30
2. db_write_research_log — Save summary and recommended actions

## Step 6: Store Memory
- honcho_remember — Store key findings for future runs
```

**Step 2: Commit**

```bash
git add agent/skills/onboarding-research/SKILL.md
git commit -m "feat(skills): add onboarding-research skill"
```

---

### Task 18: Deal management skill

**Files:**
- Create: `agent/skills/deal-management/SKILL.md`

**Step 1: Write skill**

```markdown
# Deal Management

## Task Generation Rules
Based on signals and contacts found, recommend engagement tasks:

1. **send_email** — When a C-suite contact is found with strong ICP fit
2. **send_linkedin_dm** — When a VP/Director has relevant background
3. **schedule_call** — When multiple signals indicate active buying intent
4. **research_deeper** — When signals are ambiguous or incomplete
5. **notify_user** — When a critical signal is detected (champion leaving, competitor move)

## Task Priority (lower = higher priority)
- 10: Critical signal (champion leaving, funding round closing)
- 25: Strong ICP + senior contact identified
- 50: Standard engagement recommendation
- 75: Low-priority follow-up
```

**Step 2: Commit**

```bash
git add agent/skills/deal-management/SKILL.md
git commit -m "feat(skills): add deal-management skill"
```

---

### Task 19: Cron schedule (refresh-check.ts)

**Files:**
- Create: `agent/schedules/refresh-check.ts`

**Step 1: Write schedule**

```ts
// agent/schedules/refresh-check.ts
import { defineSchedule } from "experimental-ash";
import { db } from "../lib/db.js";
import { organisations, agentRuns } from "../lib/db/schema.js";
import { and, lte, eq } from "drizzle-orm";

export default defineSchedule({
  name: "refresh-check",
  cron: "0 * * * *", // hourly
  execute: async () => {
    const dueOrgs = await db.select().from(organisations)
      .where(and(
        lte(organisations.nextRunAt, new Date()),
        eq(organisations.status, "active"),
      ));

    for (const org of dueOrgs) {
      // Create a new agent_run record
      const [run] = await db.insert(agentRuns).values({
        orgId: org.id,
        status: "pending",
        startedAt: new Date(),
      }).returning();

      // TODO: Trigger Ash agent session for this org
      // This requires calling useAshAgent() or Ash session API
      console.log(`Scheduled run ${run.id} for org ${org.name}`);
    }
  },
});
```

**Step 2: Commit**

```bash
git add agent/schedules/refresh-check.ts
git commit -m "feat(agent): add hourly refresh-check cron schedule"
```

---

### Task 20: Write agent/instructions.md (full system prompt)

**Files:**
- Modify: `agent/instructions.md`

**Step 1: Write full system prompt**

Replace the placeholder with:

```markdown
You are RevenueOS, an autonomous account research agent for APAC markets.

## Your Mission
Research target accounts, surface buying signals, identify key contacts, and recommend next-best-actions for sales teams.

## Research Workflow
1. Load the market skill for the account's hqCountry
2. Recall accumulated knowledge via honcho_recall
3. Search for contacts via exa_people_search
4. Detect signals via exa_company_signals
5. Research events via exa_event_research
6. Persist contacts via db_write_contacts
7. Persist signals via db_write_signals
8. Update the org via db_update_org (set score + refresh interval)
9. Write research log via db_write_research_log
10. Store learnings via honcho_remember

## Scoring Rules
- Score 70-100: refreshIntervalDays = 3 (strong ICP fit)
- Score 50-69: refreshIntervalDays = 14 (moderate fit)
- Score 0-49: refreshIntervalDays = 30 (poor fit)

## Output Quality
- Every signal must include quotes from stakeholders or news sources
- Every signal must include icpRelevance reasoning
- Every contact must include a relevanceNote
- Signal types are dynamic — derive them from the ICP description, not a fixed list

## Constraints
- Only research organisations you are given — do not scope-creep
- Always honcho_recall BEFORE searching — use accumulated knowledge
- Always honcho_remember AFTER researching — store key findings
- Be thorough but efficient — prefer parallel tool calls when possible
```

**Step 2: Commit**

```bash
git add agent/instructions.md
git commit -m "feat(agent): write full RevenueOS system prompt"
```

---

## Phase 4: Frontend (Tasks 21–27)

> Next.js pages, Shadcn UI, agent run trigger, results display.

### Task 21: Install Shadcn UI + base components

**Step 1: Init Shadcn**

```bash
npx shadcn@latest init -d
```

**Step 2: Add components needed for demo**

```bash
npx shadcn@latest add button card input label badge table tabs separator avatar
```

**Step 3: Commit**

```bash
git add components/ lib/utils.ts components.json package.json pnpm-lock.yaml
git commit -m "feat(ui): init Shadcn UI with base components"
```

---

### Task 22: Dashboard page — org cards list

**Files:**
- Create: `app/page.tsx`
- Create: `app/layout.tsx`
- Create: `components/org-card.tsx`

**Step 1: Create layout**

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RevenueOS — Autonomous Account Research",
  description: "AI agent that researches target accounts across APAC markets",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

**Step 2: Create dashboard page**

```tsx
// app/page.tsx
import { OrgCard } from "@/components/org-card";

// TODO: Replace with actual DB query via server action
const DEMO_ORGS = [
  { id: "1", name: "Grab", domain: "grab.com", country: "Singapore", status: "active", score: 85, signalCount: 7, lastRun: "2 hours ago" },
  { id: "2", name: "Canva", domain: "canva.com", country: "Australia", status: "active", score: 72, signalCount: 4, lastRun: "1 day ago" },
  { id: "3", name: "Sea Group", domain: "seagroup.com", country: "Singapore", status: "active", score: 68, signalCount: 5, lastRun: "3 days ago" },
  { id: "4", name: "Tokopedia", domain: "tokopedia.com", country: "Indonesia", status: "onboarding", score: null, signalCount: 0, lastRun: null },
  { id: "5", name: "Gojek", domain: "gojek.com", country: "Indonesia", status: "onboarding", score: null, signalCount: 0, lastRun: null },
];

export default function Dashboard() {
  return (
    <main className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">RevenueOS</h1>
      <p className="text-muted-foreground mb-8">Autonomous account research for APAC markets</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {DEMO_ORGS.map((org) => (
          <OrgCard key={org.id} org={org} />
        ))}
      </div>
    </main>
  );
}
```

**Step 3: Create OrgCard component**

```tsx
// components/org-card.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface OrgCardProps {
  org: {
    id: string;
    name: string;
    domain: string;
    country: string;
    status: string;
    score: number | null;
    signalCount: number;
    lastRun: string | null;
  };
}

export function OrgCard({ org }: OrgCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg">{org.name}</CardTitle>
        <Badge variant={org.status === "active" ? "default" : "secondary"}>
          {org.status}
        </Badge>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{org.domain} · {org.country}</p>
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm">
            <span className="font-medium">Score:</span> {org.score ?? "—"}
            <span className="mx-2">·</span>
            <span className="font-medium">Signals:</span> {org.signalCount}
          </div>
          <Button size="sm" disabled={org.status === "onboarding"}>
            Run
          </Button>
        </div>
        {org.lastRun && (
          <p className="text-xs text-muted-foreground mt-2">Last run: {org.lastRun}</p>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 4: Commit**

```bash
git add app/ components/org-card.tsx
git commit -m "feat(frontend): dashboard page with org cards"
```

---

### Task 23: Org detail page — contacts, signals, tasks tabs

**Files:**
- Create: `app/org/[id]/page.tsx`
- Create: `components/contacts-table.tsx`
- Create: `components/signals-list.tsx`
- Create: `components/tasks-list.tsx`

**Step 1: Create org detail page with tabs**

The detail page shows 3 tabs: Contacts, Signals, Tasks. Each tab queries the DB via server actions (or shows demo data).

**Step 2: Create table/list components**

- `contacts-table.tsx` — Table with name, title, LinkedIn, seniority, relevance note
- `signals-list.tsx` — Cards with type badge, title, quotes, ICP relevance, sources
- `tasks-list.tsx` — List with type icon, description, status badge, priority, rationale

**Step 3: Commit**

```bash
git add app/org/ components/contacts-table.tsx components/signals-list.tsx components/tasks-list.tsx
git commit -m "feat(frontend): org detail page with contacts, signals, tasks tabs"
```

---

### Task 24: Agent run trigger + streaming UI

**Files:**
- Create: `components/agent-run-panel.tsx`

**Step 1: Create agent run trigger**

Uses `useAshAgent()` hook to trigger research and stream results in real-time.

```tsx
// components/agent-run-panel.tsx
"use client";

import { useAshAgent } from "experimental-ash/react";
import { Button } from "@/components/ui/button";

interface AgentRunPanelProps {
  orgId: string;
  orgName: string;
}

export function AgentRunPanel({ orgId, orgName }: AgentRunPanelProps) {
  const agent = useAshAgent();
  const isRunning = agent.status === "submitted" || agent.status === "streaming";

  const handleRun = async () => {
    await agent.sendMessage(
      `Research ${orgName} (orgId: ${orgId}). Follow the onboarding-research skill workflow.`
    );
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Agent Research</h3>
        <Button onClick={handleRun} disabled={isRunning}>
          {isRunning ? "Researching..." : "Run Research"}
        </Button>
      </div>
      {/* Stream messages as they come in */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {agent.data.messages.map((msg) => (
          <div key={msg.id} className="text-sm">
            {msg.parts.map((part, i) =>
              part.type === "text" ? <p key={i}>{part.text}</p> : null
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/agent-run-panel.tsx
git commit -m "feat(frontend): agent run trigger with useAshAgent streaming"
```

---

### Task 25: Onboarding page — add new org

**Files:**
- Create: `app/onboarding/page.tsx`

**Step 1: Create onboarding form**

Simple form: company name, domain, country, ICP description, optional file upload. On submit, creates org in DB via server action.

**Step 2: Commit**

```bash
git add app/onboarding/page.tsx
git commit -m "feat(frontend): onboarding page for new organisations"
```

---

### Task 26: API routes for data

**Files:**
- Create: `app/api/orgs/route.ts`
- Create: `app/api/orgs/[id]/contacts/route.ts`
- Create: `app/api/orgs/[id]/signals/route.ts`
- Create: `app/api/orgs/[id]/tasks/route.ts`

**Step 1: Create GET routes**

Each route queries Drizzle and returns JSON. These feed the dashboard and detail pages.

```ts
// app/api/orgs/route.ts
import { db } from "@/agent/lib/db.js";
import { organisations } from "@/agent/lib/db/schema.js";
import { NextResponse } from "next/server";

export async function GET() {
  const orgs = await db.select().from(organisations);
  return NextResponse.json(orgs);
}
```

**Step 2: Commit**

```bash
git add app/api/
git commit -m "feat(api): add REST routes for orgs, contacts, signals, tasks"
```

---

### Task 27: Auth middleware (Cognito JWT)

**Files:**
- Create: `middleware.ts`
- Create: `lib/cognito.ts`

**Step 1: Create Cognito JWT verifier**

Verify JWT from Cognito in middleware. For demo, allow bypass with `DEMO_MODE=true`.

**Step 2: Create middleware**

Protect `/api/*` and `/org/*` routes. Allow `/onboarding`, `/`, and `/demo` unauthenticated.

**Step 3: Commit**

```bash
git add middleware.ts lib/cognito.ts
git commit -m "feat(auth): add Cognito JWT middleware with demo bypass"
```

---

## Phase 5: Stripe Integration (Tasks 28–30)

> Subscription billing, metered usage, billing portal.

### Task 28: Stripe checkout + webhook

**Files:**
- Create: `app/api/stripe/checkout/route.ts`
- Create: `app/api/stripe/webhook/route.ts`
- Create: `lib/stripe.ts`

**Step 1: Create Stripe client**

```ts
// lib/stripe.ts
import Stripe from "stripe";
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
```

**Step 2: Create checkout route**

Creates a Stripe Checkout Session for the Teams plan.

**Step 3: Create webhook route**

Handles `checkout.session.completed` and `invoice.paid` events.

**Step 4: Install + commit**

```bash
pnpm add stripe
git add lib/stripe.ts app/api/stripe/ package.json pnpm-lock.yaml
git commit -m "feat(stripe): add checkout session and webhook handler"
```

---

### Task 29: Metered billing — per-run usage

**Files:**
- Create: `app/api/stripe/usage/route.ts`

**Step 1: Create usage reporting**

After each agent run, report usage to Stripe via `stripe.subscriptionItems.createUsageRecord()`.

**Step 2: Commit**

```bash
git add app/api/stripe/usage/route.ts
git commit -m "feat(stripe): add per-run metered usage reporting"
```

---

### Task 30: Billing portal page

**Files:**
- Create: `app/billing/page.tsx`

**Step 1: Create billing page**

Link to Stripe Customer Portal for plan management. Shows subscription status and usage.

**Step 2: Commit**

```bash
git add app/billing/page.tsx
git commit -m "feat(stripe): add billing portal page"
```

---

## Phase 6: Seed Data + Deploy (Tasks 31–33)

> Demo data, final polish, deploy.

### Task 31: Seed script — hero account (Grab) + 4 set dressing

**Files:**
- Modify: `agent/db/seed.ts`

**Step 1: Write seed data**

```ts
// agent/db/seed.ts
// Seeds:
// - 1 workspace (demo user)
// - 5 organisations: Grab (hero), Canva, Sea Group, Tokopedia, Gojek
// - 1 completed agent run per org
// - 15 contacts (3 per org, real APAC tech leaders)
// - 10+ signals (varied types with quotes and icpRelevance)
// - 10 tasks (2 per org, varied types)
```

**Step 2: Run seed**

```bash
pnpm drizzle-kit push  # Push schema to Aurora RDS
pnpm tsx agent/db/seed.ts  # Seed demo data
```

**Step 3: Commit**

```bash
git add agent/db/seed.ts
git commit -m "feat(db): add seed script with Grab hero + 4 set dressing orgs"
```

---

### Task 32: Demo mode fallback

**Files:**
- Create: `app/demo/page.tsx`

**Step 1: Create demo replay page**

Static page that loads pre-recorded agent run JSON and replays the execution trace. Active when `DEMO_MODE=true`.

**Step 2: Commit**

```bash
git add app/demo/page.tsx
git commit -m "hack: add demo mode fallback page for stage (revert after)"
```

---

### Task 33: Deploy to Vercel + AWS

**Step 1: Push schema to Aurora RDS**

```bash
pnpm drizzle-kit push
```

**Step 2: Deploy to Vercel**

```bash
vercel --prod
```

**Step 3: Set environment variables in Vercel dashboard**

All vars from `.env.example` — use production values (not dev).

**Step 4: Verify**

- [ ] App loads on public URL
- [ ] Dashboard shows 5 org cards
- [ ] Click "Run" on Grab triggers agent
- [ ] Agent completes research cycle
- [ ] Results appear on detail page
- [ ] Stripe billing portal works
- [ ] Cron job shows next run scheduled

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: deploy to production"
```

---

## Summary

| Phase | Tasks | Scope |
|---|---|---|
| 1. Foundation | 1–5 | Config, schema, DB client, system prompt |
| 2. Agent Tools | 6–14 | 9 tools (Exa, Drizzle, Honcho) |
| 3. Skills + Schedule | 15–20 | 4 skills, cron, system prompt |
| 4. Frontend | 21–27 | Dashboard, detail, onboarding, API routes |
| 5. Stripe | 28–30 | Checkout, webhook, metered billing, portal |
| 6. Seed + Deploy | 31–33 | Demo data, fallback, deploy |

**Total: 33 tasks. Estimated 24 hours.**
