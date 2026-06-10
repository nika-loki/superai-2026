/**
 * RevenueOS — Database Schema (8 Tables, 4 Enums)
 *
 * Enums removed: seniorityEnum, taskTypeEnum → agent decides types dynamically
 * Enums kept: orgStatusEnum, runStatusEnum, taskStatusEnum, dealStageEnum (system-level)
 * Organisation.md stored in S3 at <workspace_id>/org.md (not in DB)
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

// ── Enums (3 — system-level only) ──────────────────────────────────

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

export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "in_progress",
  "completed",
  "skipped",
  "failed",
]);

export const dealStageEnum = pgEnum("deal_stage", [
  "discovery",
  "qualified",
  "proposal",
  "negotiation",
  "closed_won",
  "closed_lost",
]);

// ── Property type ──────────────────────────────────────────────────

type Property = { key: string; value: string; type: "text" | "number" | "url" | "date" };

// ── Helpers ────────────────────────────────────────────────────────

const now = (name: string) => timestamp(name, { withTimezone: true }).defaultNow().notNull();
const nullableTz = (name: string) => timestamp(name, { withTimezone: true });

// ── Tables ─────────────────────────────────────────────────────────

/** 1. workspaces — multi-tenant scope, Cognito sub */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  cognitoSub: text("cognito_sub").notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).notNull(),
  avatarUrl: text("avatar_url"),
  /** Organisation.md is stored in S3 at <workspace_id>/org.md */
  hubspotIntegration: jsonb("hubspot_integration").$type<{
    portalId: string;
    accessToken: string; // AES-256 encrypted
    connectedAt: string;
    lastImportAt?: string;
    importStatus?: "idle" | "running" | "error";
    errorMessage?: string;
  }>(),
  createdAt: now("created_at"),
}, (t) => [
  index("workspaces_email_idx").on(t.email),
]);

/** 2. organisations — target accounts to research */
export const organisations = pgTable("organisations", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  hqCountry: text("hq_country").notNull(),
  /** Brief description of why this target is relevant to the seller's ICP */
  icpDescription: text("icp_description").notNull(),
  /** Dynamic key-value properties (industry, employee_count, funding_stage, etc.) */
  properties: jsonb("properties").$type<Property[]>().default([]),
  opportunityScore: integer("opportunity_score"),
  lastResearchedAt: nullableTz("last_researched_at"),
  nextRunAt: nullableTz("next_run_at"),
  refreshIntervalDays: integer("refresh_interval_days"),
  honchoPeerId: text("honcho_peer_id").unique(),
  hubspotId: text("hubspot_id").unique(),
  status: orgStatusEnum("status").default("onboarding"),
  onboardingMetadata: jsonb("onboarding_metadata")
    .$type<Record<string, unknown>>(),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
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
  /** Array of tool call records persisted by the capture-trace hook */
  traceData: jsonb("trace_data").$type<Array<{
    callId: string;
    toolName: string;
    status: "completed" | "failed" | "running";
    input?: string;
    output?: string;
    startedAt?: string;
    completedAt?: string;
  }>>().default([]),
  /** Chain-of-thought reasoning text accumulated during the run */
  chainOfThought: text("chain_of_thought"),
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
  startedAt: nullableTz("started_at"),
  completedAt: nullableTz("completed_at"),
  createdAt: now("created_at"),
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
  /** Dynamic — agent decides (e.g. "C-Suite", "VP", "Director", "Head of Engineering") */
  seniority: text("seniority").default("unknown"),
  /** Dynamic key-value properties (location, department, tenure, etc.) */
  properties: jsonb("properties").$type<Property[]>().default([]),
  hubspotId: text("hubspot_id").unique(),
  source: text("source").default("exa"),
  relevanceNote: text("relevance_note"),
  discoveredAt: now("discovered_at"),
}, (t) => [
  uniqueIndex("contacts_org_linkedin_idx").on(t.orgId, t.linkedinUrl),
  index("contacts_org_id_idx").on(t.orgId),
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
  /** Dynamic — agent decides (e.g. "funding_round", "leadership_change", "product_launch") */
  type: text("type").notNull(),
  title: text("title").notNull(),
  quotes: jsonb("quotes").notNull()
    .$type<Array<{ text: string; speaker?: string; source?: string }>>(),
  icpRelevance: text("icp_relevance").notNull(),
  sources: jsonb("sources").notNull()
    .$type<Array<{ url: string; title: string; publishedDate?: string }>>(),
  impact: integer("impact"),
  createdAt: now("created_at"),
}, (t) => [
  index("signals_org_id_idx").on(t.orgId),
  index("signals_org_created_idx").on(t.orgId, t.createdAt),
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
  /** Dynamic — agent decides (e.g. "send_email", "linkedin_dm", "schedule_call", "research_deeper") */
  type: text("type").notNull(),
  status: taskStatusEnum("status").default("pending"),
  description: text("description").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  rationale: text("rationale"),
  /** IDs of the signals that triggered this task — links tasks to evidence */
  signalIds: jsonb("signal_ids").$type<string[]>().default([]),
  priority: integer("priority").default(50),
  executedAt: nullableTz("executed_at"),
  result: text("result"),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [
  index("tasks_org_id_idx").on(t.orgId),
  index("tasks_status_idx").on(t.orgId, t.status),
  index("tasks_org_priority_idx").on(t.orgId, t.priority),
]);

/** 7. deals — pipeline opportunities */
export const deals = pgTable("deals", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull()
    .references(() => organisations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  stage: dealStageEnum("stage").default("discovery"),
  valueUsd: integer("value_usd"),
  expectedCloseDate: timestamp("expected_close_date", { withTimezone: true }),
  probability: integer("probability").default(20),
  primaryContactId: uuid("primary_contact_id")
    .references(() => contacts.id, { onDelete: "set null" }),
  properties: jsonb("properties").$type<Property[]>().default([]),
  hubspotId: text("hubspot_id").unique(),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [
  index("deals_org_id_idx").on(t.orgId),
  index("deals_stage_idx").on(t.stage),
]);

/** 8. relationships — contact-to-contact connections */
export const relationships = pgTable("relationships", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull()
    .references(() => organisations.id, { onDelete: "cascade" }),
  fromContactId: uuid("from_contact_id").notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  toContactId: uuid("to_contact_id").notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  /** Dynamic — agent decides (e.g. "reports_to", "mentor", "former_colleague", "collaborator") */
  type: text("type").notNull(),
  description: text("description"),
  influence: integer("influence").default(50),
  createdAt: now("created_at"),
}, (t) => [
  index("rels_org_id_idx").on(t.orgId),
  index("rels_from_idx").on(t.fromContactId),
  index("rels_to_idx").on(t.toContactId),
]);

// ── Relations ──────────────────────────────────────────────────────

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  organisations: many(organisations),
}));

export const organisationsRelations = relations(organisations, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [organisations.workspaceId], references: [workspaces.id],
  }),
  agentRuns: many(agentRuns),
  contacts: many(contacts),
  signals: many(signals),
  tasks: many(tasks),
  deals: many(deals),
  relationships: many(relationships),
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
  primaryDeals: many(deals),
  relationshipsFrom: many(relationships, { relationName: "fromContact" }),
  relationshipsTo: many(relationships, { relationName: "toContact" }),
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

export const dealsRelations = relations(deals, ({ one }) => ({
  organisation: one(organisations, {
    fields: [deals.orgId], references: [organisations.id],
  }),
  primaryContact: one(contacts, {
    fields: [deals.primaryContactId], references: [contacts.id],
  }),
}));

export const relationshipsRelations = relations(relationships, ({ one }) => ({
  organisation: one(organisations, {
    fields: [relationships.orgId], references: [organisations.id],
  }),
  fromContact: one(contacts, {
    fields: [relationships.fromContactId], references: [contacts.id],
    relationName: "fromContact",
  }),
  toContact: one(contacts, {
    fields: [relationships.toContactId], references: [contacts.id],
    relationName: "toContact",
  }),
}));
