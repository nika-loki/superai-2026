# RevenueOS — System Architecture

## Overview

RevenueOS is a single-agent system that autonomously researches target accounts across APAC markets. An Ash agent runs on Vercel, uses Exa for search intelligence, Honcho for per-account memory, Aurora RDS for persistence, HubSpot for CRM context, and Stripe for billing.

```
┌──────────────────────────────────────────────────────────────┐
│                    Vercel (Edge + Serverless)                │
│                                                              │
│  ┌───────────┐     ┌──────────────┐    ┌──────────────┐     │
│  │  Next.js  │────>│  Ash Agent   │───>│ Vercel AI    │     │
│  │ App Router│     │(defineAgent) │    │ Gateway      │     │
│  └───────────┘     └──────┬───────┘    └──────────────┘     │
│       │                   │                                  │
│  useAshAgent()     ┌──────┼─────────────────┐                │
│  (React hook)      │      │        │        │                │
│                    ▼      ▼        ▼        ▼                │
│               ┌────┐  ┌─────┐  ┌───────┐ ┌───────┐         │
│               │Exa │  │Honcho│  │Aurora │ │HubSpot│         │
│               │API │  │Cloud │  │RDS    │ │CRM    │         │
│               └────┘  └─────┘  └───────┘ └───────┘         │
│                                                              │
│  ┌──────────┐     ┌──────────┐    ┌──────────┐             │
│  │ AWS S3   │     │AWS       │    │ Stripe   │             │
│  │ (uploads)│     │Cognito   │    │(billing) │             │
│  └──────────┘     └──────────┘    └──────────┘             │
│                                                              │
│  ┌──────────┐                                                │
│  │Braintrust│                                                │
│  │(OTel)    │                                                │
│  └──────────┘                                                │
└──────────────────────────────────────────────────────────────┘
```

---

## Architecture Decisions

### Single-Package Monolith

Ash requires the agent and Next.js to live in the same package. The agent is at `agent/`, the Next.js app is at `app/`, and they share a single `package.json`. `withAsh()` in `next.config.ts` wires them together.

**Why:** Ash framework constraint. The agent and frontend must be deployable as one Vercel project.

### Single Agent (Not Multi-Agent)

One Ash agent handles all research for one account at a time. No orchestrator-agent delegation.

**Why:** YAGNI. A single agent with 16 tools and market-specific skills is sufficient for the demo. Multi-agent coordination adds complexity with no demo payoff.

### Per-Account Memory via Honcho

Each organisation gets one permanent Honcho peer (`honchoPeerId`). Each agent run creates a new session under that peer. The agent recalls accumulated knowledge before each run and stores new findings after.

**Why:** Honcho sessions are ephemeral, but peers are permanent. This gives the agent cumulative intelligence per account without a custom memory layer.

### Self-Scheduling via Cron

The agent decides its own refresh interval after each run (1/3/14/30 days based on ICP fit). It writes `nextRunAt` to the database. An hourly Vercel Cron job queries for due accounts and triggers new agent sessions, capped at 5 concurrent refreshes per hour.

**Why:** Demonstrates autonomy — the agent decides when to re-research, not a human.

### Vercel AI Gateway for Inference

All LLM calls go through Vercel AI Gateway (not AWS Bedrock). The gateway handles provider routing, fallbacks, and rate limiting. Model: `anthropic/claude-sonnet-4`.

**Why:** Required for Top 5 qualification (must use at least one Vercel product). Also simpler than managing Bedrock credentials.

### IAM Auth for RDS

Database connections use AWS IAM authentication, not static passwords. Locally, the dev assumes an IAM role via STS (`AWS_ROLE_ARN`). On Vercel, OIDC-based credentials are used via `@vercel/oidc-aws-credentials-provider`. IAM tokens are pre-generated in a background loop every 10 minutes (tokens valid 15 minutes) to eliminate cold-start latency. A direct password fallback (`DB_USE_PASSWORD=true`) is available for debugging.

**Why:** Security best practice — no static database credentials in the environment.

### HubSpot CRM Integration with Encrypted Credentials

HubSpot OAuth tokens are stored encrypted at rest in `workspaces.hubspotIntegration` (AES-256-GCM via `agent/lib/crypto.ts`). The agent does ad-hoc lookups via `hubspot_lookup` during research. Bulk import is an async background job triggered from the UI at `/settings/integrations`.

**Why:** CRM data supplements Exa research without replacing it. Encrypted storage is required for OAuth tokens in the database.

---

## Component Details

### Ash Agent (`agent/`)

**Entry point:** `agent/agent.ts`

```typescript
import { defineAgent } from "experimental-ash";
export default defineAgent({
  model: "anthropic/claude-sonnet-4",
});
```

**System prompt:** `agent/instructions.md` — Contains RevenueOS persona, research methodology, tool usage guidelines, output quality standards, ICP scoring framework, signal/contact/task quality criteria.

**Channel:** `agent/channels/ash.ts` — Ash HTTP channel with `localDev()` + `vercelOidc()` auth for development and Vercel deployment.

**Telemetry:** `agent/instrumentation.ts` — Braintrust OTel exporter for trace visualization and observability.

### 16 Agent Tools (`agent/tools/`)

Each tool is a `defineTool()` export in its own file.

#### Exa Search Tools (5)

| Tool | File | Description |
|---|---|---|
| `exa_people_search` | `exa-people-search.ts` | LinkedIn profile discovery at target companies via Exa neural search. Filter by title, country. Returns names, titles, LinkedIn URLs, seniority. Auto-filters to last 60 days. |
| `exa_company_deep_dive` | `exa-company-deep-dive.ts` | 8 parallel Exa searches: funding, leadership, expansion, product, financials, regulatory, ICP signals, competitive. Returns grouped by angle. Auto-filters to 60 days. |
| `exa_person_deep_dive` | `exa-person-deep-dive.ts` | 6-angle stakeholder profiling: speeches, podcasts, conferences, LinkedIn activity, social interests, recent news. Auto-filters to 60 days. |
| `exa_agentic_research` | `exa-agentic-research.ts` | Multi-step research via Exa Agent API (beta identifier "agent-2026-05-07"). For complex questions requiring synthesis. Optional JSON output schema for structured results. |
| `exa_answer` | `exa-answer.ts` | Direct Q&A with citations via Exa Answer API. For targeted factual queries. Agent must check `publishedDate` for recency. |

**Exa integration details:**
- Uses Exa's neural search API with `type: "neural"` for semantic matching
- People search uses `contents.text` to extract LinkedIn profile data
- Company deep dive constructs 8 query angles dynamically from the org's `icpDescription`
- Person deep dive runs 6 parallel searches for comprehensive stakeholder profiles
- Agent API beta header `agent-2026-05-07` passed per-call (not on constructor)
- All search tools except `exa_answer` auto-filter to last 60 days
- `exa_answer` citations may include older sources — agent must validate recency

#### DB Write Tools (5)

| Tool | File | Description |
|---|---|---|
| `db_write_contacts` | `db-write-contacts.ts` | Persist discovered contacts with name, title, LinkedIn URL, seniority (dynamic text), relevance note. Dedup by org+linkedin URL. |
| `db_write_signals` | `db-write-signals.ts` | Persist signals with dynamic type, title, quotes[], icpRelevance, multi-source URLs, impact score. Auto-deduped by title similarity, recency-filtered. |
| `db_write_tasks` | `db-write-tasks.ts` | Persist engagement tasks with dynamic type, description, rationale, priority (1-100), linked signal IDs. |
| `db_write_research_log` | `db-write-research-log.ts` | Finalize agent_run: summary, icpFitScore, recommended actions, duration. Accepts `memoryContent` to auto-save Honcho memory. |
| `db_update_org` | `db-update-org.ts` | Update organisation: opportunityScore (0-100), nextRunAt, refreshIntervalDays, lastResearchedAt, status. |

**Database access pattern:**
- All tools import from `agent/lib/db/schema.ts` (re-exported from `agent/db/schema.ts`)
- Uses Drizzle ORM — never raw SQL
- All writes are transactional where multiple records are involved
- DB client (`agent/lib/db/index.ts`) uses IAM auth with background token refresh

#### DB Read Tools (3)

| Tool | File | Description |
|---|---|---|
| `db_get_org` | `db-get-org.ts` | Fetch org details: name, domain, HQ, ICP, score, status, properties. Call first before research. |
| `db_create_run` | `db-create-run.ts` | Create agent_run record (status: running). Returns runId for subsequent writes. Call at START of session. |
| `db_update_signal` | `db-update-signal.ts` | Link signal to contact, or update icpRelevance/impact. Used during synthesis when cross-referencing signals with people. |

#### Memory Tools (2)

| Tool | File | Description |
|---|---|---|
| `honcho_remember` | `honcho-remember.ts` | Store findings via org's permanent Honcho peer. Accumulates across runs. |
| `honcho_recall` | `honcho-recall.ts` | Retrieve accumulated knowledge from all prior runs on this account. |

**Honcho architecture:**
- `honchoPeerId` is set on organisations table (permanent, unique per account)
- Each run: `session.context({ peerTarget })` returns summary + accumulated peer representation
- After run: `session.addMessages(findings)` — accumulates across runs
- `db_write_research_log` auto-saves memory if `memoryContent` is provided

#### CRM Tool (1)

| Tool | File | Description |
|---|---|---|
| `hubspot_lookup` | `hubspot-lookup.ts` | Search RevenueOS DB for accounts/contacts imported from HubSpot CRM. Searches by domain, name, or email. Use BEFORE Exa research to avoid duplicating effort. |

**HubSpot integration details:**
- `hubspot_lookup` searches the local RevenueOS database (not live HubSpot API) for CRM-imported data
- Bulk import is an async background job triggered from `/settings/integrations` UI
- Import runs: companies -> contacts -> deals, upserts by `hubspotId`
- OAuth tokens stored encrypted in `workspaces.hubspotIntegration` (AES-256-GCM)
- HubSpot client factory: `agent/lib/hubspot.ts` creates per-workspace clients from stored credentials
- Stage mapping: appointmentscheduled -> discovery, qualifiedtobuy -> qualified, presentationscheduled -> proposal, closedwon -> closed_won, closedlost -> closed_lost

### 7 Skills (`agent/skills/`)

Skills are directories containing `SKILL.md` files that define context-aware instructions for the agent.

| Category | Skill | Path | Purpose |
|---|---|---|---|
| Market | Singapore | `skills/singapore/SKILL.md` | Singapore-specific research parameters: local business culture, key industries, common titles, search strategies. |
| Market | Australia | `skills/australia/SKILL.md` | Australia-specific research parameters. |
| Market | Indonesia | `skills/indonesia/SKILL.md` | Indonesia-specific research parameters. |
| Workflow | Prospecting | `skills/prospecting/SKILL.md` | ICP matching methodology, contact prioritization, signal detection rules. |
| Workflow | Onboarding Research | `skills/onboarding-research/SKILL.md` | First-run research procedure: initial deep dive, baseline signal capture, initial contacts. |
| Integration | Deal Management | `skills/deal-management/SKILL.md` | Pipeline stage assessment, deal tracking, engagement timing. |
| Integration | HubSpot Import | `skills/hubspot-import/SKILL.md` | HubSpot CRM ad-hoc lookup during research. Stage mapping reference. Notes that bulk import is UI-triggered, not agent-triggered. |

### Cron Schedule (`agent/schedules/`)

**`refresh-check.ts`** — Ash `defineSchedule()` with hourly fixed cron (`0 * * * *`).

Queries for active organisations where `nextRunAt <= now()`, capped at 5 concurrent refreshes per hour. For each due org, sends a message to the Ash channel with instructions for a REFRESH RUN (net-new developments only, check Honcho memory to avoid repeating old signals).

---

## Data Flow

### Research Cycle (per account)

```
1. User clicks "Run" on dashboard
   └─> POST /ash/v1/session (via useAshAgent)
       └─> Ash agent starts session
           |
2. Agent loads market skill
   └─> skills/singapore/SKILL.md injected into context
       |
3. Agent fetches org context
   ├─> db_get_org(orgId) — get ICP, status, properties
   └─> honcho_recall(org.honchoPeerId) — get accumulated memory
       |
4. Agent checks CRM context
   └─> hubspot_lookup(domain) — check for existing CRM data
       |
5. Agent executes Exa searches (parallel where possible)
   ├─> exa_company_deep_dive("Grab", ICP description)
   ├─> exa_people_search("Grab", "CTO VP Engineering Singapore")
   ├─> exa_agentic_research("complex question about Grab's strategy")
   └─> exa_answer("What is Grab's latest funding round?")
       |
6. Agent deep-dives key contacts
   └─> exa_person_deep_dive("Reuben Lai", "Grab") — for top contacts
       |
7. Agent persists results
   ├─> db_create_run(orgId) — get runId
   ├─> db_write_signals([...signals], runId)
   ├─> db_write_contacts([...contacts], runId)
   ├─> db_write_tasks([...tasks], runId)
   └─> db_update_signal(signalId, contactId) — cross-reference
       |
8. Agent finalizes and stores memory
   ├─> db_write_research_log({ summary, score, memoryContent })
   └─> db_update_org({ opportunityScore, refreshIntervalDays, nextRunAt })
```

### Scheduling Flow

```
Vercel Cron (hourly)
  └─> refresh-check.ts
      └─> SELECT FROM organisations
          WHERE nextRunAt <= NOW() AND status = 'active'
          LIMIT 5
          |
          For each due org:
          └─> receive(ashChannel, "Run a REFRESH research on {org}...")
              └─> Full research cycle (steps 2-8 above)
```

### Frontend Flow

```
Browser
  └─> useAshAgent() React hook
      ├─> sendMessage("Research Grab") -> starts session
      ├─> data.messages -> render chat responses
      ├─> events -> render tool calls in real-time
      └─> session -> persist to localStorage for reconnect
          |
      Dashboard pages:
      ├─> GET /api/orgs/search?q=grab -> search organisations
      ├─> GET /api/orgs/[id] -> org detail (signals, contacts, tasks, deals, runs)
      ├─> PATCH /api/orgs/[id]/settings -> update ICP/properties
      ├─> GET /api/orgs/active-run -> get running agent run
      ├─> PATCH /api/tasks/[id] -> update task status
      └─> POST /api/stripe/checkout -> create checkout session
```

---

## Database Schema (8 Tables, 4 Enums)

See `agent/db/schema.ts` for the full Drizzle definitions.

### Entity Relationship

```
workspaces (1) ──> (N) organisations
organisations (1) ──> (N) agent_runs
organisations (1) ──> (N) contacts
organisations (1) ──> (N) signals
organisations (1) ──> (N) tasks
organisations (1) ──> (N) deals
organisations (1) ──> (N) relationships
agent_runs (1) ──> (N) contacts (nullable FK)
agent_runs (1) ──> (N) signals (nullable FK)
agent_runs (1) ──> (N) tasks (nullable FK)
contacts (1) ──> (N) signals (nullable FK)
contacts (1) ──> (N) tasks (nullable FK)
contacts (1) ──> (N) deals (primaryContactId)
contacts <──> contacts (relationships: fromContactId <-> toContactId)
```

### Tables

1. **workspaces** — Multi-tenant scope. Cognito sub (unique), name, email, avatar. `hubspotIntegration` JSONB stores encrypted OAuth credentials + import status. Organisation.md stored in S3 at `<workspace_id>/org.md`.

2. **organisations** — Target account + agent identity. Domain, name, HQ country, ICP description, dynamic properties (JSONB key-value array), `opportunityScore`, `lastResearchedAt`, `nextRunAt`, `refreshIntervalDays`, `honchoPeerId` (unique), `hubspotId` (unique), `onboardingMetadata`. Status enum: `onboarding | active | paused | churned`. Unique index on (domain, workspaceId).

3. **agent_runs** — Execution history. Ash session ID, status, tools invoked count, trace data (JSONB array of tool call records), chain-of-thought text, duration, tokens used, summary, ICP fit score, recommended actions (JSONB), error details (JSONB). Status enum: `pending | running | completed | failed`.

4. **contacts** — Discovered people. Name, title, LinkedIn URL, email, seniority (dynamic text, NOT enum), properties (JSONB key-value array), hubspotId (unique), source (default "exa"), relevance note. Dedup by unique index on (orgId, linkedinUrl).

5. **signals** — Dynamic intelligence events. Type (dynamic text, NOT enum — from ICP matching), title, quotes (JSONB array with text/speaker/source), icpRelevance, sources (JSONB array with url/title/publishedDate), impact (1-10). Nullable FK to contacts for signal-to-person linkage.

6. **tasks** — Engagement actions. Type (dynamic text, NOT enum), status enum, description, payload (JSONB), rationale, signalIds (JSONB array), priority (default 50), executedAt, result.

7. **deals** — Pipeline opportunities. Title, description, stage enum (`discovery | qualified | proposal | negotiation | closed_won | closed_lost`), value USD, expected close date, probability (default 20), primary contact FK, properties (JSONB), hubspotId (unique).

8. **relationships** — Contact-to-contact connections. fromContactId, toContactId (both cascade delete), type (dynamic text, NOT enum), description, influence (default 50). Indexed on both contact FKs.

### 4 Enums

| Enum | Values |
|---|---|
| `orgStatusEnum` | `onboarding`, `active`, `paused`, `churned` |
| `runStatusEnum` | `pending`, `running`, `completed`, `failed` |
| `taskStatusEnum` | `pending`, `in_progress`, `completed`, `skipped`, `failed` |
| `dealStageEnum` | `discovery`, `qualified`, `proposal`, `negotiation`, `closed_won`, `closed_lost` |

### Dynamic text fields (NOT enum)

- `contacts.seniority` — e.g., "C-Suite", "VP", "Director", "Head of Engineering"
- `signals.type` — e.g., "funding_round", "leadership_change", "expansion", "product_launch", "partnership"
- `tasks.type` — e.g., "send_email", "linkedin_dm", "schedule_call", "research_deeper"
- `relationships.type` — e.g., "reports_to", "mentor", "former_colleague", "collaborator"

---

## External Services

### AWS Aurora RDS (PostgreSQL)

- **Purpose:** All persistent data (8 tables)
- **Access:** Drizzle ORM via `agent/lib/db/index.ts` (connection pool with IAM auth)
- **Auth:** IAM tokens via `@aws-sdk/rds-signer`. Local: STS AssumeRole. Vercel: OIDC via `@vercel/oidc-aws-credentials-provider`. Direct password fallback via `DB_USE_PASSWORD=true`.
- **Token lifecycle:** Background refresh every 10 min (tokens valid 15 min). Warm-up query on module load. Keepalive every 60s.
- **Pool:** Max 5 connections on Vercel, 10 locally. `idleTimeoutMillis` recycles before token expiry.
- **Migrations:** `drizzle-kit push` or `drizzle-kit migrate`

### AWS S3

- **Purpose:** Onboarding file uploads (Organisation.md per workspace)
- **Bucket:** `revenueos-<env>-uploads`
- **Access:** Pre-signed URLs

### AWS Cognito

- **Purpose:** Authentication, JWT tokens
- **User Pool:** Email-based signup
- **Integration:** Next.js middleware validates JWT, extracts `cognitoSub`
- **Stub:** For demo, Cognito auth can be bypassed with a hardcoded user

### Vercel AI Gateway

- **Purpose:** LLM inference for agent reasoning
- **Model:** `anthropic/claude-sonnet-4` (via AI Gateway routing)
- **Auth:** `AI_GATEWAY_API_KEY` in `.env.local`

### Exa API

- **Purpose:** People search, company deep dives, person deep dives, agentic research, Q&A with citations
- **Auth:** `EXA_API_KEY` in `.env.local`
- **Rate limits:** Managed per Exa plan. Agent has built-in rate limiter.

### Honcho Cloud

- **Purpose:** Per-account accumulated memory
- **SDK:** `@honcho-ai/sdk` v2.1.2
- **Auth:** `HONCHO_API_KEY` in `.env.local`
- **Architecture:** 1 peer per organisation, sessions per run. `HONCHO_WORKSPACE_ID` env var (defaults to "default").

### HubSpot CRM

- **Purpose:** CRM data enrichment and import
- **SDK:** `@hubspot/api-client` v13.5.0
- **Auth:** OAuth tokens encrypted at rest (AES-256-GCM) in `workspaces.hubspotIntegration`
- **Agent tool:** `hubspot_lookup` for ad-hoc lookups during research
- **Bulk import:** Async background job from `/settings/integrations` UI
- **Stage mapping:** HubSpot pipeline stages mapped to `dealStageEnum`

### Stripe

- **Purpose:** Subscription billing + metered usage
- **SDK:** `stripe` v22.2.0
- **Integration:** Checkout session on onboarding, billing portal link, webhook for events
- **Auth:** `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in `.env.local`
- **Demo flow:** Subscription visible in billing portal, per-run usage metered via `/api/stripe/usage`

### Braintrust

- **Purpose:** Agent observability and trace visualization
- **SDK:** `braintrust` v3.17.0 (core) + `@braintrust/otel` v0.2.0 (OTel exporter)
- **Integration:** OpenTelemetry exporter via `agent/instrumentation.ts`
- **Auth:** `BRAINTRUST_API_KEY` in `.env.local`

---

## Deployment

### Vercel (Frontend + Agent)

- Single project deployment
- `withAsh()` in `next.config.ts` bundles Ash agent with Next.js
- Webpack extension alias `.js` -> `.ts/.tsx` for Ash imports
- Vercel Cron for hourly scheduling
- Environment variables set in Vercel dashboard

### AWS (Infrastructure)

| Service | Resource | Naming |
|---|---|---|
| Aurora RDS | Serverless v2 PostgreSQL cluster | `revenue-os.cluster-*.us-west-2.rds.amazonaws.com` |
| S3 | Upload bucket | `revenueos-<env>-uploads` |
| Cognito | User pool | `revenueos-<env>-users` |
| IAM | Role for RDS auth | `AWS_ROLE_ARN` env var |

### Environment Variables

```bash
# Database
DB_HOST=revenue-os.cluster-xxx.us-west-2.rds.amazonaws.com
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_USE_PASSWORD=false          # Set "true" + DB_PASSWORD for direct password auth
DB_PASSWORD=                   # Optional direct password (if DB_USE_PASSWORD=true)
AWS_ROLE_ARN=arn:aws:iam::...  # IAM role for RDS auth (STS locally, OIDC on Vercel)
AWS_REGION=us-west-2

# AI
AI_GATEWAY_API_KEY=vck_...

# Search
EXA_API_KEY=...

# Memory
HONCHO_API_KEY=...
HONCHO_WORKSPACE_ID=default

# Storage
S3_BUCKET_NAME=revenueos-dev-uploads
AWS_REGION=us-west-2

# Auth
COGNITO_USER_POOL_ID=...
COGNITO_CLIENT_ID=...

# Payments
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...

# Encryption (for HubSpot OAuth tokens)
ENCRYPTION_KEY=...             # 32-byte hex string (64 chars)

# Observability
BRAINTRUST_API_KEY=...

# Demo
DEMO_MODE=false
```

---

## Failure Handling

| Failure | Recovery |
|---|---|
| Exa API timeout | Retry with exponential backoff, persist partial results |
| Aurora RDS connection loss | Drizzle connection pool auto-reconnect, IAM token background refresh |
| Honcho unavailable | Agent continues without recall/remember for this cycle |
| AI Gateway 5xx | Provider fallback via gateway, agent retries |
| Stripe webhook miss | Events logged for manual reconciliation |
| Cognito JWT expired | Frontend refreshes token, middleware redirects to login |
| Agent crash mid-run | `agent_runs.status` stays "running", cron re-triggers after timeout |
| HubSpot API error | `hubspot_lookup` returns error message, agent proceeds with Exa-only research |
| IAM token generation failure | All credential caches cleared, full retry with fresh STS credentials |

---

## Demo Fallback

If live agent execution fails during the demo:

1. **DEMO_MODE=true** — Environment flag switches to demo mode
2. **Pre-recorded JSON** — Full agent run captured as static JSON file
3. **Static /demo page** — Standalone page that replays the recorded run
4. **Seed data** — 5 organisations with pre-populated contacts, signals, tasks
5. **POST /api/seed** — API endpoint to reload demo data on demand

The demo always works because seed data is loaded before the stage presentation.
