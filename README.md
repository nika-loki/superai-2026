# RevenueOS by SalesDuo

**Background Autonomous Per-Account Sales Agent, Purpose-Built for APAC**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

One agent per account. Runs autonomously in the background. Embedded in HubSpot. Adapts to whatever the account's current sales stage requires.

Built for the [SuperAI 2026 Hackathon](https://www.superai.com/next-hackathon).

## Thesis

**Human sellers. AI superpowers.**

AI handles the **Pre** (research, signals, briefings, warm paths) and the **Post** (drafts, CRM updates, tasks, follow-through). Humans own the **During**: every live buyer conversation. The agent never conducts live buyer conversations. Pre and Post only.

## Why APAC

Deals here run on WhatsApp, across multiple countries and languages, with low CRM hygiene. The deal context never reaches the CRM — so tools that read CRM exhaust have nothing to read. RevenueOS captures **off-CRM context** into a self-learning graph. **Capture is the product, not a prerequisite.**

## The Agent Model

- **Sales agent, scoped to the sales motion only.** Not a generic agent platform.
- **One agent instance per CRM account**, each with its own context.
- **Runs autonomously in the background.** No prompting required.
- **Stage-adaptive**: the agent decides what to do from account state — prospecting, qualification, demo prep, negotiation, stall, loss, post-close nurture.
- **Self-scheduling**: decides its own refresh interval (3 / 14 / 30 days) based on ICP fit quality.
- **Self-learning**: Honcho accumulates memory across runs per account. Each cycle is smarter than the last.

## How It Works

1. **Add target accounts** — Enter company names or domains with your ICP criteria
2. **Agent researches autonomously** — 8-angle Exa company deep dives, 6-dimension stakeholder profiling, signal detection, people discovery
3. **Signals surface automatically** — Funding rounds, leadership changes, product launches, expansion signals — all captured and scored for ICP relevance
4. **Get prioritized actions** — Engagement tasks with rationale: who to contact, what to say, when to reach out
5. **Agent re-runs on its own** — Self-determined schedule based on account fit, accumulating knowledge across runs

## Tech Stack

| Layer | Technology |
|---|---|
| Agent Framework | [experimental-ash](https://github.com/anthropics/ash) |
| AI | Vercel AI Gateway (Anthropic Claude) |
| Search | [Exa](https://exa.ai) (5 agent tools) |
| Frontend | Next.js 15 (App Router) + Shadcn UI |
| Database | AWS Aurora RDS (PostgreSQL) + Drizzle ORM |
| Storage | AWS S3 |
| Auth | AWS Cognito |
| Payments | [Stripe](https://stripe.com) (subscription + metered usage) |
| Agent Memory | [Honcho](https://honcho.ai) |
| CRM | HubSpot (embedded integration) |
| Observability | Braintrust + OpenTelemetry |
| Hosting | Vercel (deploy + cron jobs) |

## Architecture

```
HubSpot CRM ←→ RevenueOS Agent → Exa Search (5 tools)
                                → DB Write (5 tools)
                                → DB Read (3 tools)
                                → Honcho Memory (2 tools)
                                → HubSpot CRM (1 tool)

Hourly Cron → Check accounts where nextRunAt ≤ now → Trigger fresh agent session
```

See [`docs/Architecture.md`](docs/Architecture.md) for the full system design.

## Agent Pipeline

1. Load market skill for the account's region
2. Fetch org context and recall accumulated knowledge from Honcho
3. Check CRM context via HubSpot lookup
4. Execute Exa searches (people, company deep dive, agentic research, Q&A)
5. Deep-dive key contacts found
6. Persist all results to Aurora RDS
7. Store learnings back to Honcho
8. Determine refresh interval and write `nextRunAt`
9. Create engagement tasks for the sales team

## 16 Agent Tools

### Exa Search (5)
- **exa_people_search** — Find stakeholders at target companies (LinkedIn profiles, titles, seniority)
- **exa_company_deep_dive** — 8-angle parallel search: funding, leadership, expansion, product, financials, regulatory, ICP signals, competitive
- **exa_person_deep_dive** — 6-angle stakeholder profiling: speeches, podcasts, conferences, LinkedIn, social, news
- **exa_agentic_research** — Multi-step synthesis via Exa Agent API for complex research questions
- **exa_answer** — Direct Q&A with citations for targeted factual queries

### Database Write (5)
- **db_write_contacts** — Persist discovered contacts (dedup by org + LinkedIn)
- **db_write_signals** — Persist signals with quotes, ICP relevance, multi-source URLs
- **db_write_tasks** — Persist engagement tasks with rationale and linked signal IDs
- **db_write_research_log** — Finalize run: summary, ICP fit score, recommended actions
- **db_update_org** — Update org scores, refresh interval, scheduling

### Database Read (3)
- **db_get_org** — Fetch org details before research begins
- **db_create_run** — Create agent_run record at session start
- **db_update_signal** — Link signals to contacts during synthesis

### Memory & CRM (3)
- **honcho_remember** — Store findings per account, accumulates across runs
- **honcho_recall** — Retrieve knowledge from all prior runs on this account
- **hubspot_lookup** — Search existing CRM data to avoid duplicating research

## Data Model (8 Tables)

`workspaces` → `organisations` → `agent_runs`, `contacts`, `signals`, `tasks`, `deals`

`contacts` ↔ `contacts` (via `relationships` — reports_to, mentor, former_colleague, collaborator)

All linked to HubSpot via `hubspotId` fields on organisations, contacts, and deals.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL database (or AWS Aurora RDS)
- Accounts for: Exa, Stripe, Honcho, HubSpot (optional)

### Setup

```bash
# Clone the repo
git clone https://github.com/nika-loki/superai-2026.git
cd superai-2026

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys and database credentials

# Start development server
pnpm dev
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in the required values. See the example file for descriptions of each variable.

## Project Structure

```
superai/
├── agent/               # Ash agent (tools, skills, instructions, DB schema)
├── app/                 # Next.js App Router (pages + API routes)
├── components/          # Shadcn UI components
├── lib/                 # Shared utilities (S3, Stripe, formatting)
├── docs/                # Architecture & planning docs
└── evals/               # Agent quality evaluations
```

## Key Commands

```bash
pnpm dev          # Start Next.js dev server with Turbopack
pnpm build        # Production build
pnpm build:ash    # Build Ash agent
pnpm dev:ash      # Ash agent dev mode
pnpm typecheck    # TypeScript type checking
```

## License

[MIT](LICENSE) — [RevenueOS by SalesDuo](https://salesduo.io)
