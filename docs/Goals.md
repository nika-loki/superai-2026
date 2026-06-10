# RevenueOS — Hackathon Goals

## Project

**RevenueOS** is an autonomous account research agent purpose-built for APAC markets. It researches target accounts, surfaces stakeholders and buying signals, and schedules ongoing re-evaluation — all without human prompting between runs.

**Event:** SuperAI Hackathon (24-hour build)
**Stage:** Live demo on the WEKA stage in front of 10,000 attendees
**Repo:** Single open-source GitHub repository

---

## Target Awards

All three awards are stackable. The build is scoped to win all three.

### 1. Top 5 Overall ($25K AWS credits + $1.5K v0 credits + Razer gift bag)

**Requirements:**
- Deploy on AWS infrastructure (Aurora RDS, S3, Cognito)
- Use at least one Vercel product (AI Gateway for inference)
- Demo must run live on WEKA stage

**How we meet it:**
- Aurora RDS (PostgreSQL-compatible) for all persistent data
- S3 for onboarding file uploads
- Cognito for authentication and JWT issuance
- Vercel AI Gateway as the sole inference provider for the Ash agent
- Next.js 15 app deployed on Vercel with a public URL judges can hit

### 2. Best Use of Exa ($1.5K Exa credits, top 3 teams)

**Requirements:**
- Most effective use of Exa for agent intelligence, search, and real-time data

**How we meet it:**
- `exa_people_search` — Find stakeholders at target accounts (titles, LinkedIn, relevance)
- `exa_company_deep_dive` — 8 parallel searches (funding, leadership, expansion, product, financials, regulatory, ICP signals, competitive)
- `exa_person_deep_dive` — 6-angle stakeholder profiling (speeches, podcasts, conferences, LinkedIn, social, news)
- `exa_agentic_research` — Multi-step synthesis via Exa Agent API for complex research questions
- `exa_answer` — Direct Q&A with citations for targeted factual queries
- Signals include quoted stakeholder statements and relevance reasoning, not just raw data
- Exa is the primary data source that feeds every research cycle — without it the agent has no intelligence

### 3. Best Use of Stripe ($1K Stripe credits, top 3 teams)

**Requirements:**
- Best depth of Stripe integration, innovative monetization, polished demo

**How we meet it:**
- Subscription billing: Teams plan with monthly recurring charge
- Metered billing: Per-account-research usage tracked and billed
- Billing portal: Self-serve plan management accessible from dashboard
- Checkout session: Onboarding flow includes Stripe checkout
- Webhook handler: Processes `checkout.session.completed` and `invoice.paid` events
- Usage records: Written to Stripe via the API after each agent run completes

---

## Judging Dimensions and How We Address Each

### 1. Agent Overview

RevenueOS runs a single Ash agent ("Ash") that performs autonomous account research for APAC markets. Given a company domain, Ash loads a market-specific skill (e.g., "Singapore"), recalls prior knowledge about the account from Honcho, searches for people and signals via Exa, persists results to the database, stores learnings in memory, decides when to re-research the account, and creates engagement tasks for the sales team.

### 2. Autonomy and Decision-Making

Ash decides its own refresh schedule based on ICP fit quality:
- Strong ICP fit → re-research in 3 days
- Moderate fit → re-research in 14 days
- Poor fit → re-research in 30 days

The agent evaluates signal strength and relevance scores to determine fit, then writes `nextRunAt` to the database. An hourly cron checks this timestamp and triggers runs when due. No human intervention is required between research cycles.

### 3. Actions and Tool Use

16 tools across five categories:

**Search (Exa — 5 tools):**
- `exa_people_search` — Finds ICP-matching people at target companies (LinkedIn profiles, titles, seniority)
- `exa_company_deep_dive` — 8-angle parallel search: funding, leadership, expansion, product, financials, regulatory, ICP signals, competitive
- `exa_person_deep_dive` — 6-angle stakeholder profiling: speeches, podcasts, conferences, LinkedIn, social, news
- `exa_agentic_research` — Multi-step synthesis via Exa Agent API for complex questions
- `exa_answer` — Direct Q&A with citations for targeted factual queries

**Persistence (Aurora RDS — 5 tools):**
- `db_write_contacts` — Persists discovered contacts
- `db_write_signals` — Persists signals with quotes, icpRelevance, multi-source URLs
- `db_write_tasks` — Persists engagement tasks with rationale and linked signal IDs
- `db_write_research_log` — Updates agent_runs with summary, score, recommended actions
- `db_update_org` — Updates nextRunAt, refreshIntervalDays, opportunityScore

**Context (DB Read — 3 tools):**
- `db_get_org` — Fetches org details before research begins
- `db_create_run` — Creates agent_run record at session start
- `db_update_signal` — Links signals to contacts during synthesis

**Memory (Honcho — 2 tools):**
- `honcho_remember` — Stores findings via org's permanent Honcho peer
- `honcho_recall` — Retrieves accumulated knowledge from all prior runs on this account

**CRM (HubSpot — 1 tool):**
- `hubspot_lookup` — Searches existing CRM data to avoid duplicating research

### 4. Orchestration

Single-agent architecture using the Ash framework on Vercel. The agent operates through a defined skill pipeline:

1. Load market skill for the account's region
2. Fetch org context and recall accumulated knowledge from Honcho
3. Check CRM context via HubSpot lookup
4. Execute Exa searches (people, company deep dive, agentic research, Q&A)
5. Deep-dive key contacts found
6. Persist all results to Aurora RDS
7. Store learnings back to Honcho
8. Determine refresh interval and write `nextRunAt`
9. Create engagement tasks

A Vercel Cron job runs hourly, queries accounts where `nextRunAt <= now`, and triggers fresh agent sessions via `useAshAgent()`.

### 5. Human-in-the-Loop

Human involvement is minimal by design:
- **Onboarding:** User provides company name, domain, and optional file upload
- **Trigger:** User clicks "Run" to initiate the first research cycle
- **Review:** User views contacts, signals, tasks, and deals on the dashboard
- **Reconnect:** User can reconnect to the Ash stream to replay full agent execution

After the initial trigger, the agent runs autonomously on its self-determined schedule.

### 6. Failure Handling

- Exa API failures: Agent retries with exponential backoff, logs partial results
- Database write failures: Transaction rollback, error logged to console
- Honcho memory failures: Agent continues without recall/remember for that cycle
- Inference failures (Vercel AI Gateway): Agent retries with provider fallback
- Cognito auth failures: Middleware redirects to login
- Stripe webhook failures: Events logged for manual reconciliation
- HubSpot API errors: `hubspot_lookup` returns error, agent proceeds with Exa-only research

### 7. Demo and Presentation

90-second live demo on the WEKA stage. See Demo Flow below.

---

## Demo Flow (90 seconds, 6 steps)

### Step 1: Onboarding (15 seconds)
- Enter company name and domain (pre-filled: "Grab", "grab.com")
- Upload an ICP document to S3
- System creates org record in Aurora RDS, uploads file to S3
- Auth via Cognito (JWT already established)

### Step 2: Dashboard (10 seconds)
- Show 5 APAC company cards on the dashboard
- Hero account: **Grab** (Singapore)
- Set dressing: Canva, Sea Group, Tokopedia, Gojek
- Each card shows account status, signal count, and last run time

### Step 3: Trigger Research (5 seconds)
- Click "Run" on the Grab card
- Triggers Ash agent session via `useAshAgent()`
- Agent begins execution in the background

### Step 4: Agent Research (30 seconds — narrated)
- Agent loads Singapore market skill
- Honcho recall: Retrieves any prior knowledge about Grab
- Exa company deep dive: 8-angle parallel search (funding, leadership, expansion, product, financials, regulatory, ICP signals, competitive)
- Exa people search: Finds stakeholders at Grab
- Exa person deep dive: 6-angle profiling of key contacts
- Writes contacts, signals, and tasks to Aurora RDS
- Honcho remember: Stores learnings for future runs
- Sets refresh interval (3 days — Grab is strong ICP fit)
- Creates engagement tasks for sales team

### Step 5: Results (15 seconds)
- Dashboard updates with real results for Grab
- Show contacts found (names, titles, LinkedIn)
- Show signals (type, summary, relevance score, quoted stakeholder)
- Show tasks (engagement recommendations)
- Show deals (pipeline stage, value)
- Reconnect to Ash stream to replay full agent execution trace

### Step 6: Scheduling (15 seconds)
- Show the cron job configuration (hourly check)
- Display `nextRunAt` timestamp on the Grab account
- Explain: Agent will re-research Grab automatically in 3 days
- Show Stripe billing: Per-run usage metered and visible in billing portal

---

## Hero Account: Grab (Singapore)

Grab is the demo centerpiece because:
- Recognizable APAC tech company (Singapore-based)
- Rich public data available via Exa (funding, expansion, leadership)
- Strong ICP fit candidate for a B2B sales tool
- Signals are plentiful: superapp expansion, fintech plays, GrabPay, GrabFood growth

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Agent Framework | Ash (experimental-ash) on Vercel | Autonomous research agent |
| Frontend | Next.js 15 + Shadcn UI | Dashboard and onboarding |
| Database | AWS Aurora RDS (PostgreSQL) | All persistent data (8 tables) |
| ORM | Drizzle ORM | Type-safe database access |
| Inference | Vercel AI Gateway | LLM calls for agent reasoning |
| Memory | Honcho Cloud | Per-account accumulated memory |
| Search | Exa API | People search, company deep dives, agentic research, Q&A |
| CRM | HubSpot | Account/contact import and lookup |
| Payments | Stripe | Subscription + metered billing |
| Storage | AWS S3 | Onboarding file uploads |
| Auth | AWS Cognito | Authentication, JWT tokens |
| Hosting | Vercel | App deployment and cron jobs |

---

## Data Model (Aurora RDS, 8 Tables)

1. **workspaces** — Multi-tenant tenant, Cognito sub, name, email, avatar, HubSpot integration (encrypted OAuth)
2. **organisations** — Account + agent identity, domain, region, ICP, opportunityScore, `nextRunAt`, `honchoPeerId`, `hubspotId`
3. **contacts** — Name, title, LinkedIn URL, seniority (dynamic), relevanceNote, linked to organisation
4. **signals** — Dynamic type (from ICP), title, quotes[], icpRelevance, multi-source URLs[], linked to organisation
5. **tasks** — Engagement task type (dynamic), description, status, priority, rationale, linked signal IDs, linked to organisation
6. **agent_runs** — Ash session ID, status, duration, icpFitScore, summary, trace data, linked to organisation
7. **deals** — Pipeline opportunities, stage, value, expected close, probability, linked to organisation and primary contact
8. **relationships** — Contact-to-contact connections (reports_to, mentor, collaborator), influence score

---

## Key Differentiators

1. **Self-scheduling agent** — Ash decides its own refresh interval (1/3/14/30 days) based on ICP fit quality. No human sets a timer.
2. **Self-learning** — Honcho accumulates memory across runs per account. Each research cycle is smarter than the last.
3. **Market-specific intelligence** — Per-country skills with region-appropriate research parameters (Singapore, Australia, Indonesia, more to come).
4. **Full tool chain** — 16 tools spanning search (Exa), persistence (RDS), context (DB read), memory (Honcho), and CRM (HubSpot).
5. **Multi-source signals** — Dynamic signal types from ICP, direct quotes from stakeholders, relevance reasoning — not just keyword matches.
6. **CRM-enriched research** — HubSpot integration supplements Exa research with existing CRM data, avoiding duplication and providing deal context.

---

## Success Criteria

- [ ] Working demo that runs live on the WEKA stage
- [ ] All 8 data tables operational in Aurora RDS
- [ ] Agent completes a full research cycle on Grab
- [ ] Dashboard displays real results (contacts, signals, tasks, deals)
- [ ] Stripe billing page is functional (subscription + metered usage visible)
- [ ] App deployed and accessible on a public Vercel URL
- [ ] AWS infrastructure verifiable by judges (RDS, S3, Cognito)
- [ ] Exa calls return real people and signal data for Grab
- [ ] Honcho memory persists across at least two agent runs
- [ ] Cron job triggers a scheduled re-run successfully
- [ ] HubSpot integration imports CRM data and agent uses it during research
- [ ] Single GitHub repository with open-source license

---

## Timeline (24 Hours)

| Block | Duration | Focus |
|---|---|---|
| Hours 0–4 | Setup | Repo scaffold, Aurora RDS schema (8 tables, 4 enums), Drizzle migrations, Cognito pool, S3 bucket, Vercel project |
| Hours 4–8 | Core Agent | Ash agent with 16 tools, Exa integrations, Honcho connect, HubSpot integration, database writes |
| Hours 8–14 | Frontend | Next.js dashboard, Shadcn cards, onboarding flow, agent run trigger, results display, deals pipeline |
| Hours 14–18 | Integrations | Stripe checkout + billing portal + metered billing, HubSpot OAuth + import, cron job, auth middleware |
| Hours 18–21 | Polish | Demo data seeding (Grab hero + 4 set dressing), error handling, UI refinements |
| Hours 21–24 | Rehearsal | Full demo dry run, stage prep, backup plan, deploy to production |
