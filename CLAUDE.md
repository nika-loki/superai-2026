# RevenueOS by SalesDuo — Autonomous Per-Account Sales Agent for APAC Markets

RevenueOS is a background autonomous per-account sales agent, embedded in HubSpot, purpose-built for APAC sales teams. One agent per account. Runs autonomously in the background. Adapts to whatever the account's current sales stage requires.

AI handles the Pre (research, signals, briefings, warm paths) and the Post (drafts, CRM updates, tasks, follow-through). Humans own the During: every live buyer conversation.

## Project Docs

- Goals and judging criteria: `docs/Goals.md`
- System architecture: `docs/Architecture.md`
- Hackathon execution plan: `docs/plans/2026-06-09-revenueos-hackathon.md`

## Ash Framework

This project uses **experimental-ash** (the Ash framework). Before writing any agent code, read the relevant guide in `node_modules/experimental-ash/dist/docs/public/`. Task-specific Ash agent guides are available as skills in `node_modules/experimental-ash/dist/skills/` — use one when it matches the change you are making. See `AGENTS.md` for the canonical reference.

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Agent framework | experimental-ash | latest |
| AI SDK | ai (Vercel AI Gateway) | 7.0.0-canary.159 |
| Validation | zod | 4.4.3 |
| Frontend | Next.js 15 (App Router) | ^15.3.3 |
| UI components | Shadcn UI | ^4.11.0 |
| ORM | Drizzle ORM | ^0.45.2 |
| Database | AWS Aurora RDS (PostgreSQL) | - |
| Object storage | @aws-sdk/client-s3 | ^3.1064.0 |
| Auth | AWS Cognito | - |
| Payments | Stripe | ^22.2.0 |
| Search API | exa-js | ^2.13.0 |
| Agent memory | @honcho-ai/sdk | ^2.1.2 |
| CRM integration | @hubspot/api-client | ^13.5.0 |
| Observability | braintrust + @braintrust/otel | ^3.17.0 / ^0.2.0 |
| TypeScript | @typescript/native-preview | 7.0.0-dev.20260523.1 |
| Runtime | ESNext (bundler resolution) | - |

## Repo Structure

```
superai/                 <- single-package monolith, cwd root
├── agent/               <- Ash agent
│   ├── agent.ts         <- defineAgent entry point (model: anthropic/claude-sonnet-4)
│   ├── instructions.md  <- system prompt (research methodology, tool usage, output quality)
│   ├── instrumentation.ts <- Braintrust OTel telemetry
│   ├── tools/           <- 16 agent tools (defineTool)
│   ├── skills/          <- 7 skill directories (3 market, 2 workflow, 2 integration)
│   ├── channels/        <- ash.ts (channel + auth config: localDev + vercelOidc)
│   ├── schedules/       <- refresh-check.ts (hourly cron)
│   ├── db/              <- Drizzle schema + seed
│   └── lib/             <- shared helpers (db client, exa, honcho, hubspot, crypto)
├── app/                 <- Next.js App Router pages + API routes
│   ├── api/             <- 10 API route handlers
│   ├── billing/         <- Stripe billing portal page
│   ├── demo/            <- Demo fallback page
│   ├── org/[id]/        <- Org detail + settings pages
│   └── settings/        <- User settings + integrations
├── components/          <- Shadcn UI components (22 app + 15 ui)
├── lib/                 <- Infra clients (S3, Stripe, formatting, mock data)
├── docs/                <- Project documentation
└── .ash/                <- Ash build/dev cache (gitignored)
```

## Coding Conventions

- **TypeScript strict mode** is enabled (`tsconfig.json` -> `strict: true`). No `any` without a suppression comment.
- **ESNext modules** (`"type": "module"` in package.json, `"module": "ESNext"` with `"moduleResolution": "bundler"` in tsconfig). No file extensions needed in imports.
- **Imports alias**: `@/*` maps to `./*` (tsconfig paths). Used throughout app/components code. Agent code uses relative imports.
- **Drizzle ORM** for all database access. Never write raw SQL. Schema lives in `agent/db/schema.ts` and is re-exported from `agent/lib/db/schema.ts`.
- **Shadcn UI** components for all frontend UI. Run `npx shadcn@latest add <component>` to add new ones. No custom UI primitives.
- **File naming**: kebab-case for all files (`my-tool.ts`, `deal-management/`). Directories match skill/tool names.
- **UUIDs** for all primary keys (pgTable with `defaultRandom()`).
- **timestamptz** for all timestamps (never `timestamp` without timezone).
- **pgEnum** for system-level enumerated columns only (`orgStatusEnum`, `runStatusEnum`, `taskStatusEnum`, `dealStageEnum`).
- **Dynamic text fields** (NOT enum): `contacts.seniority`, `signals.type`, `tasks.type`, `relationships.type` — the agent decides these dynamically.
- **3NF design**: no JSON blobs for queryable data. `jsonb` is only for opaque payloads (properties arrays, metadata, raw API responses, trace data).
- **Environment variables**: accessed via `process.env`. Secrets go in `.env.local` (gitignored). Never commit keys.
- **Credential encryption**: HubSpot OAuth tokens encrypted at rest via AES-256-GCM (`agent/lib/crypto.ts`, requires `ENCRYPTION_KEY`).

## Agent Tool Patterns

Tools are defined using `defineTool` from `experimental-ash/tools`. Each tool lives in its own file under `agent/tools/`.

```typescript
import { defineTool } from "experimental-ash/tools";
import { z } from "zod";

export default defineTool({
  name: "tool_name",
  description: "What this tool does for the agent",
  inputSchema: z.object({
    param: z.string().describe("Parameter description"),
  }),
  async execute({ param }) {
    // Implementation
  },
});
```

### 16 Agent Tools

#### Exa Search (5)

| Tool | File | Purpose |
|---|---|---|
| `exa_people_search` | `exa-people-search.ts` | LinkedIn profile discovery at target companies. Filter by title, country. Auto-filters to last 60 days. |
| `exa_company_deep_dive` | `exa-company-deep-dive.ts` | 8 parallel searches: funding, leadership, expansion, product, financials, regulatory, ICP signals, competitive. |
| `exa_person_deep_dive` | `exa-person-deep-dive.ts` | 6-angle stakeholder profiling: speeches, podcasts, conferences, LinkedIn, social, news. |
| `exa_agentic_research` | `exa-agentic-research.ts` | Multi-step research via Exa Agent API (beta). For complex questions requiring synthesis. |
| `exa_answer` | `exa-answer.ts` | Direct Q&A with citations. For targeted factual queries. Agent must check `publishedDate` for recency. |

#### DB Write (5)

| Tool | File | Purpose |
|---|---|---|
| `db_write_contacts` | `db-write-contacts.ts` | Persist discovered contacts (name, title, LinkedIn, seniority, relevance note). Dedup by org+linkedin. |
| `db_write_signals` | `db-write-signals.ts` | Persist signals (dynamic type, title, quotes, icpRelevance, multi-source URLs). Auto-deduped, recency-filtered. |
| `db_write_tasks` | `db-write-tasks.ts` | Persist engagement tasks with rationale, priority, linked signal IDs. |
| `db_write_research_log` | `db-write-research-log.ts` | Finalize agent_run: summary, icpFitScore, recommended actions. Accepts `memoryContent` for auto-Honcho save. |
| `db_update_org` | `db-update-org.ts` | Update organisation: opportunityScore, nextRunAt, refreshIntervalDays, status. |

#### DB Read (3)

| Tool | File | Purpose |
|---|---|---|
| `db_get_org` | `db-get-org.ts` | Fetch org details (name, domain, HQ, ICP, score, status, properties). |
| `db_create_run` | `db-create-run.ts` | Create agent_run record (status: running). Returns runId. Call at START of session. |
| `db_update_signal` | `db-update-signal.ts` | Link signal to contact, or update icpRelevance/impact. Used during synthesis phase. |

#### Memory (2)

| Tool | File | Purpose |
|---|---|---|
| `honcho_remember` | `honcho-remember.ts` | Store findings via org's permanent Honcho peer. Accumulates across runs. |
| `honcho_recall` | `honcho-recall.ts` | Retrieve accumulated knowledge from all prior runs on this account. |

#### CRM (1)

| Tool | File | Purpose |
|---|---|---|
| `hubspot_lookup` | `hubspot-lookup.ts` | Search RevenueOS DB for accounts/contacts imported from HubSpot CRM. Use BEFORE Exa research to avoid duplication. |

## Skill Patterns

Skills are organized in directories under `agent/skills/`. Each skill directory contains a `SKILL.md` that defines the skill's trigger, instructions, and behavior for the agent.

```
agent/skills/
├── singapore/            <- Singapore market: local business culture, key industries, search strategies
├── australia/            <- Australia market: local business culture, key industries, search strategies
├── indonesia/            <- Indonesia market: local business culture, key industries, search strategies
├── prospecting/          <- ICP matching methodology, contact prioritization, signal detection rules
├── onboarding-research/  <- First-run research procedure: initial deep dive, baseline signal capture
├── deal-management/      <- Pipeline stage assessment, deal tracking, engagement timing
└── hubspot-import/       <- HubSpot CRM ad-hoc lookup during research, stage mapping reference
```

## Database Schema

8 tables defined in `agent/db/schema.ts`:

`workspaces` | `organisations` | `agent_runs` | `contacts` | `signals` | `tasks` | `deals` | `relationships`

Key relationships:
- Workspace -> Organisations -> (AgentRuns, Contacts, Signals, Tasks, Deals, Relationships)
- AgentRuns -> (Contacts, Signals, Tasks) via nullable FK
- Contacts -> (Signals, Tasks) via nullable FK
- Contacts -> Deals (primaryContactId)
- Contacts <-> Contacts (Relationships, self-referential via fromContactId/toContactId)
- Organisations <-> HubSpot (hubspotId), Contacts <-> HubSpot (hubspotId), Deals <-> HubSpot (hubspotId)

### 4 Enums

| Enum | Values |
|---|---|
| `orgStatusEnum` | `onboarding`, `active`, `paused`, `churned` |
| `runStatusEnum` | `pending`, `running`, `completed`, `failed` |
| `taskStatusEnum` | `pending`, `in_progress`, `completed`, `skipped`, `failed` |
| `dealStageEnum` | `discovery`, `qualified`, `proposal`, `negotiation`, `closed_won`, `closed_lost` |

### Dynamic text fields (NOT enum)

- `contacts.seniority` — agent decides (e.g., "C-Suite", "VP", "Director", "Head of Engineering")
- `signals.type` — agent decides (e.g., "funding_round", "leadership_change", "product_launch")
- `tasks.type` — agent decides (e.g., "send_email", "linkedin_dm", "schedule_call", "research_deeper")
- `relationships.type` — agent decides (e.g., "reports_to", "mentor", "former_colleague", "collaborator")

## API Routes (10)

| Route | Method(s) | Purpose |
|---|---|---|
| `/api/orgs/search` | GET | Search organisations by domain/name |
| `/api/orgs/active-run` | GET | Get the active (running) agent run |
| `/api/orgs/[id]` | GET | Full org detail (signals, tasks, contacts, deals, runs) |
| `/api/orgs/[id]/settings` | PATCH | Update workspace Organisation.md in S3 |
| `/api/tasks/[id]` | PATCH | Update task status (pending/in_progress/completed/skipped) |
| `/api/stripe/checkout` | POST | Create Stripe checkout session ($99/mo Pro) |
| `/api/stripe/usage` | POST | Report agent run meter event to Stripe |
| `/api/stripe/webhook` | POST | Handle Stripe webhook events |
| `/api/seed` | POST | Seed demo data |
| `/api/perf` | GET | DB health check + pool stats |

## Pages (7)

| Path | Purpose |
|---|---|
| `/` | Dashboard — org cards with status, signal count, last run |
| `/billing` | Stripe billing portal (subscription + metered usage) |
| `/demo` | Demo fallback page (pre-recorded run replay) |
| `/org/[id]` | Org detail — contacts, signals, tasks, deals, relationships |
| `/org/[id]/settings` | Org settings — ICP, properties, region |
| `/settings` | User settings — Organisation.md editor |
| `/settings/integrations` | HubSpot OAuth connection + bulk import trigger |

## YAGNI Rules

This is a 24-hour hackathon. Only build what the demo needs:

- **No speculative features.** If it is not in the demo script or the hackathon plan, do not build it.
- **No over-engineering.** Prefer a working simple solution over an elegant complex one.
- **No future-proofing.** Do not add abstraction layers, plugin systems, or config flags for things that might be needed later.
- **Mock what you can.** If a service (Cognito, S3) is not critical for the demo, hardcode or stub it.
- **Ship over perfect.** A working demo with rough edges beats a polished half-finished product.

## Commit Conventions

Use conventional commits:

```
feat(agent): add exa_people_search tool
fix(db): correct contacts unique index
docs: update architecture diagram
chore: pin drizzle-orm version
hack: temp bypass auth for demo (revert after)
```

- `feat(scope):` new feature
- `fix(scope):` bug fix
- `docs:` documentation only
- `chore:` build, deps, tooling
- `hack:` temporary hack for demo (must note revert plan)

## Key Commands

```bash
pnpm dev          # Start Next.js dev server with Turbopack
pnpm build        # Production build (next build)
pnpm start        # Start production server
pnpm build:ash    # Ash build
pnpm dev:ash      # Ash dev
pnpm typecheck    # TypeScript type checking (tsgo)
```
