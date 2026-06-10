# RevenueOS — Judging Guide

How we meet every award criterion and judging dimension.

---

## Awards We're Targeting

All three awards are stackable. RevenueOS is scoped to win all three.

### 1. Top 5 Overall ($25K AWS credits + $1.5K v0 credits + Razer gift bag)

| Requirement | How We Meet It |
|---|---|
| **Deploy on AWS infrastructure** | RevenueOS runs on **3 AWS services** — not API calls to external compute: |
| | **Aurora RDS** (PostgreSQL-compatible) — all persistent data across 8 tables. Agent reads and writes contacts, signals, tasks, deals, relationships, and run history directly to RDS via IAM auth. |
| | **S3** — stores per-workspace ICP documents (Organisation.md) and onboarding uploads. Agent reads seller context from S3 at the start of every run. |
| | **Cognito** — issues JWTs for authentication. All API routes verify Cognito tokens. |
| **Use at least one Vercel product** | **Vercel AI Gateway** — the sole inference provider for the Ash agent. Every model call (tool selection, reasoning, output generation) routes through Vercel AI Gateway to Anthropic Claude. No direct API calls. |
| **Live demo on stage** | Full end-to-end: add account → trigger agent → watch real research stream in → see contacts, signals, tasks, and deals populate in the dashboard. |

### 2. Best Use of Exa ($1.5K Exa credits × top 3)

| Dimension | How We Use Exa |
|---|---|
| **Depth of integration** | **5 dedicated agent tools** call Exa — it is the primary intelligence source for the entire product. Without Exa the agent has no data. |
| | `exa_people_search` — discovers stakeholders at target companies by title, country, seniority. Auto-filters to last 60 days for recency. |
| | `exa_company_deep_dive` — **8 parallel searches** per company: funding, leadership changes, expansion signals, product launches, financials, regulatory filings, ICP signal matching, competitive landscape. |
| | `exa_person_deep_dive` — **6-angle profiling** per stakeholder: speeches, podcasts, conference appearances, LinkedIn activity, social media, news mentions. |
| | `exa_agentic_research` — multi-step synthesis via Exa Agent API for complex research questions that require chaining searches. |
| | `exa_answer` — direct Q&A with citations for targeted factual queries. Agent validates `publishedDate` for recency. |
| **Intelligence quality** | Signals include **quoted stakeholder statements**, ICP relevance scoring, and multi-source URL citations — not just keyword matches. The agent reasons about why a signal matters for this specific seller's ICP. |
| **Real-time data** | Every research cycle pulls live data. The agent's self-scheduling means accounts are continuously re-researched — Grab gets re-evaluated every 3 days because it's a strong ICP fit. |

### 3. Best Use of Stripe ($1K Stripe credits × top 3)

| Dimension | How We Use Stripe |
|---|---|
| **Depth of integration** | **4 Stripe surfaces** in the product: |
| | **Checkout** — onboarding flow includes Stripe checkout session for Teams plan subscription. |
| | **Metered billing** — per-account-research usage tracked via Stripe meter events. Each agent run reports usage to Stripe after completion. |
| | **Billing portal** — self-serve plan management accessible from the dashboard. Users can view subscription status, usage history, and manage payment methods. |
| | **Webhooks** — processes `checkout.session.completed` and `invoice.paid` events to sync subscription state. |
| **Innovative monetization** | Hybrid model: flat subscription + metered usage per agent run. Aligns cost with value delivered — more accounts researched means more revenue intelligence generated. |
| **Polished demo** | Billing is visible in the dashboard, not buried. Users see their plan, usage, and can self-serve upgrade. |

---

## Judging Dimensions

### 1. Agent Overview

RevenueOS is a **skill-routed sales agent** — one primary agent with 7 specialized sub-behaviors for different sales scenarios.

- **Purpose**: autonomous per-account sales research agent, purpose-built for APAC
- **One agent instance per CRM account**, each with its own context and memory
- **7 skills** act as sub-agents: onboarding-research, prospecting, deal-management, singapore, australia, indonesia, hubspot-import
- **3 dynamic instruction layers** inject context automatically: seller ICP, account memory, stage detection
- **Stage-adaptive**: the agent detects account state (new prospect, active engagement, refresh run) and selects the right skill
- **Scope**: the sales motion only. It handles the **Pre** (research, signals, briefings, warm paths) and the **Post** (drafts, CRM updates, tasks, follow-through). Humans own the **During** (every live buyer conversation). The agent never conducts live buyer conversations.
- **Embedded in HubSpot** — reads existing CRM data to avoid duplicating research, writes contacts/deals back
- **Model**: Anthropic Claude via Vercel AI Gateway, orchestrated through the Ash framework

### 2. Autonomy & Decision-Making

The agent is fully autonomous after the initial account trigger. No human prompting between runs.

**How it decides what to do next:**

| Decision | How It's Made |
|---|---|
| **Research depth** | Agent evaluates ICP fit from org properties and prior signals. Strong fit → full 8-angle deep dive + person deep dives. Moderate → targeted search only. |
| **Refresh interval** | Self-determined based on ICP fit quality: 3 days (strong), 14 days (moderate), 30 days (poor). Written to `nextRunAt` in the database. An hourly cron triggers runs when due. |
| **Signal relevance** | Each signal is scored against the seller's ICP (`icpRelevance` field). The agent reasons about *why* a signal matters for this specific account, not just that it exists. |
| **Contact prioritization** | Contacts are ranked by seniority, relevance to ICP, and connection to active signals. The agent creates engagement tasks for the highest-priority contacts first. |
| **Stage adaptation** | The agent adapts its behavior based on the account's current sales stage — prospecting, qualification, demo prep, negotiation, stall, loss, or post-close nurture. |

**Reasoning patterns:**
- **Sequential planning with full model intelligence**: We don't use rigid state machines or scripted workflows. The agent follows a sequential pipeline (load context → recall memory → research → persist → remember), but within each step, it operates with the model's full reasoning capability — choosing which tools to call, how to interpret results, when to go deeper vs. move on, and how to synthesize findings. The pipeline provides structure; the model provides judgment.
- **Self-correction**: if Exa returns no results, agent tries alternate queries; if Honcho is unavailable, it continues without recall

### 2b. Self-Learning & Self-Improving Architecture

RevenueOS gets smarter with every run — not through prompt engineering, but through accumulated memory and behavioral adaptation.

**How it learns across runs:**

| Mechanism | How It Works |
|---|---|
| **Honcho persistent memory** | Each account has its own Honcho peer. Every run stores learnings — company overview, key contacts, signal interpretations, what worked, what didn't. Next run recalls everything. The agent literally remembers what it learned last time. |
| **Cross-run signal comparison** | On refresh runs, the agent compares new signals against Honcho memory to identify *what changed*. It doesn't re-research from scratch — it builds on prior intelligence. |
| **Adaptive depth** | The agent learns from its own scoring history. If an account scored 80 last run and no new signals emerged, it spends less time on deep dives and more on targeted monitoring. If signals are heating up, it goes deeper. |
| **Contact relationship accumulation** | Relationships (reports_to, mentor, former_colleague, collaborator) persist across runs. The agent builds a richer org chart every cycle. |
| **Task outcome feedback** | Pending tasks from prior runs are visible on each turn (via stage-context.ts). The agent can see what it recommended last time, check if tasks were actioned, and adjust its next recommendations accordingly. |

**Self-improvement loop:**

```
Run 1: Broad research → baseline signals + contacts → initial ICP score
  ↓ (Honcho stores: company overview, key people, signal landscape)
Run 2: Targeted refresh → compares against Run 1 memory → finds what changed
  ↓ (Honcho stores: new signals, updated relationships, what worked)
Run 3: Stage-adaptive → detects ACTIVE ENGAGEMENT → switches to deal-management skill
  ↓ (Honcho stores: buying committee dynamics, competitive intel, timing signals)
Run N: The agent knows this account deeply. It surfaces nuanced, relationship-aware
       recommendations that no first-run agent could produce.
```

**The model as a reasoning engine, not a script executor:**

Traditional agent architectures use finite state machines: if state X, do Y. RevenueOS takes a different approach. The sequential pipeline provides scaffolding (load context → research → persist → remember), but within each step the model exercises full judgment. It decides:
- Which of the 5 Exa tools to call based on what it already knows
- When a signal is worth pursuing deeper vs. moving on
- How to frame ICP relevance for this specific seller's capabilities
- What opening line would resonate with this specific stakeholder
- Whether the account needs a full deep dive or a targeted refresh

This is why the quality of output improves across runs — the model isn't just executing a script with more data. It's reasoning over an increasingly rich context with each cycle.

### 3. Actions & Tool Use

**16 tools across 5 categories:**

| Category | Tools | What They Do |
|---|---|---|
| **Exa Search (5)** | `exa_people_search`, `exa_company_deep_dive`, `exa_person_deep_dive`, `exa_agentic_research`, `exa_answer` | Discover stakeholders, research companies from 8 angles, profile individuals across 6 dimensions, synthesize complex research, answer factual questions with citations |
| **DB Write (5)** | `db_write_contacts`, `db_write_signals`, `db_write_tasks`, `db_write_research_log`, `db_update_org` | Persist contacts (dedup by org+LinkedIn), signals (with quotes, ICP scores, multi-source URLs), engagement tasks, run summaries, org scores and scheduling |
| **DB Read (3)** | `db_get_org`, `db_create_run`, `db_update_signal` | Fetch account context, create run records, link signals to contacts during synthesis |
| **Memory (2)** | `honcho_remember`, `honcho_recall` | Store and retrieve accumulated knowledge per account across runs |
| **CRM (1)** | `hubspot_lookup` | Search existing CRM data before Exa research to avoid duplication |

**Data flow:**
```
HubSpot lookup (check existing data)
→ Exa searches (discover new data)
→ DB writes (persist findings)
→ Honcho remember (store learnings)
→ Task creation (next-best-actions)
→ Schedule update (set nextRunAt)
```

### 4. Orchestration

**Skill-routed agent architecture** — one primary agent (Ash, Claude Sonnet 4) with **7 specialized skills** that act as sub-behaviors for different sales scenarios. The agent self-selects which skill to activate based on account state.

**Dynamic context injection (3 layers, automatic):**

| Layer | What It Does | When |
|---|---|---|
| **Seller ICP** (`org-soul.ts`) | Loads the seller's Organisation.md from S3 + target account details from RDS. Injects seller POV into every turn. | Session start |
| **Account memory** (`honcho-recall.ts`) | Recalls accumulated knowledge from all prior runs via Honcho. Each account has its own peer. | Session start |
| **Stage detection** (`stage-context.ts`) | Counts existing contacts, signals, and pending tasks. Classifies the account as NEW PROSPECT, ACTIVE ENGAGEMENT, or REFRESH RUN. Adapts agent behavior accordingly. | Every turn |

**Skill routing — agent picks the right sub-behavior based on what the account needs:**

| Skill | When It Activates | What It Does |
|---|---|---|
| **onboarding-research** | New account, no prior intelligence | Comprehensive first-run: 8-angle company deep dive, contact discovery, signal baseline |
| **prospecting** | Need to build out the buying committee | Contact prioritization (P0-P3), signal detection checklist, ICP scoring (0-100) |
| **deal-management** | Active sales cycle, existing contacts/signals | Buying committee mapping, next-best-action by deal stage (discovery → evaluation → negotiation → at-risk), engagement timing |
| **singapore** | Account HQ'd in Singapore | Market-specific search strategies, local business culture, key industries |
| **australia** | Account HQ'd in Australia | Market-specific search strategies, local business culture, key industries |
| **indonesia** | Account HQ'd in Indonesia | Market-specific search strategies, local business culture, key industries |
| **hubspot-import** | CRM data available for the account | Lookup existing contacts/deals to avoid duplicating research |

**Execution pipeline:**

```
Session starts
  → org-soul.ts injects seller ICP + target account
  → honcho-recall.ts injects accumulated memory
  → stage-context.ts classifies account stage
  → Agent selects appropriate skill(s)
  → Executes research via 16 tools
  → Persists findings to RDS + Honcho
  → Updates scheduling (nextRunAt)
  → Creates engagement tasks
```

**Scheduling:** A Vercel Cron job runs hourly, queries accounts where `nextRunAt <= now`, and triggers fresh agent sessions. No human intervention required between research cycles.

### 5. Human-in-the-Loop

The agent is not agentic in a "human-in-the-loop" sense — it is **proactive, not reactive**.

Information gathering and triangulation of almost any data is fully autonomous: the agent searches, cross-references, scores, and persists without any human direction. It then tells the human exactly what to do — who to contact, what to say, when to reach out, and why.

The human's only role is to **act on the agent's recommendations** in live buyer conversations. Every research cycle, signal capture, contact enrichment, and task generation happens without human involvement.

| What | Who Does It |
|---|---|
| Research, search, signal detection, contact discovery | **Agent — fully autonomous** |
| Cross-referencing data across Exa, HubSpot, Honcho | **Agent — fully autonomous** |
| Scoring signals against ICP, prioritizing contacts | **Agent — fully autonomous** |
| Deciding when to re-research an account | **Agent — fully autonomous (self-scheduling)** |
| Recommending next-best-actions with rationale | **Agent — proactive suggestions** |
| Having live buyer conversations | **Human — owns the "During"** |

### 6. Failure Handling

| Failure Mode | Recovery Strategy |
|---|---|
| **Exa API failure** | Agent retries with exponential backoff. Logs partial results — completed searches are persisted even if later searches fail. |
| **Database write failure** | Transaction rollback. Error logged to console. Agent continues with remaining tools. |
| **Honcho memory failure** | Agent continues without recall/remember for that cycle. Next run will attempt again. No data loss — Honcho is additive, not required. |
| **Vercel AI Gateway failure** | Agent retries with provider fallback. If inference is unavailable, the run is marked `failed` and the cron will retry on the next hourly check. |
| **Cognito auth failure** | Middleware redirects to login. No unauthenticated access possible. |
| **Stripe webhook failure** | Events logged for manual reconciliation. Webhook endpoint returns 200 to acknowledge receipt, processes asynchronously. |
| **HubSpot API error** | `hubspot_lookup` returns error gracefully. Agent proceeds with Exa-only research — no HubSpot dependency for core functionality. |

---

## Infrastructure Verification (for judges)

| Service | How to Verify |
|---|---|
| **AWS Aurora RDS** | Database queries run against the RDS cluster via IAM auth. Check the `/api/perf` endpoint for pool stats and latency. |
| **AWS S3** | Organisation.md files are read from and written to S3 during onboarding and agent runs. Visible in the settings page. |
| **AWS Cognito** | All API routes verify JWTs issued by Cognito. Unauthenticated requests are rejected. |
| **Vercel AI Gateway** | Every agent model call routes through Vercel AI Gateway. Visible in the agent trace panel during runs. |
| **Vercel hosting** | App is deployed on Vercel with a public URL. Cron jobs trigger hourly. |
