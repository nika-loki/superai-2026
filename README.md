# RevenueOS

**Autonomous Account Research Agent for APAC Markets**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

RevenueOS is an AI agent that autonomously researches target accounts across 30+ APAC markets, surfaces buying signals, identifies key contacts, and recommends next-best-actions for sales teams.

Built for the [SuperAI 2026 Hackathon](https://superai.io/) in 24 hours.

## How It Works

1. **Add target accounts** — Enter company names or domains with your ICP criteria
2. **Agent researches autonomously** — The AI agent runs deep research using Exa search: company deep dives, stakeholder profiling, signal detection, people discovery
3. **Signals surface automatically** — Funding rounds, leadership changes, product launches, expansion signals — all captured and scored for ICP relevance
4. **Get daily actions** — Prioritized tasks with rationale: who to contact, what to say, when to reach out

## Tech Stack

| Layer | Technology |
|---|---|
| Agent Framework | [experimental-ash](https://github.com/anthropics/ash) |
| AI | Vercel AI Gateway (Anthropic Claude) |
| Search | [Exa](https://exa.ai) (5 agent tools) |
| Frontend | Next.js 15 (App Router) + Shadcn UI |
| Database | AWS Aurora RDS (PostgreSQL) + Drizzle ORM |
| Payments | [Stripe](https://stripe.com) (subscription + metered usage) |
| Agent Memory | [Honcho](https://honcho.ai) |
| CRM | HubSpot integration |
| Observability | Braintrust + OpenTelemetry |

## Architecture

```
User → Next.js UI → Ash Agent → Exa Search (5 tools)
                              → DB Write (5 tools)
                              → DB Read (3 tools)
                              → Honcho Memory (2 tools)
                              → HubSpot CRM (1 tool)
```

See [`docs/Architecture.md`](docs/Architecture.md) for the full system design.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL database (or AWS Aurora RDS)
- Accounts for: Exa, Stripe, Honcho, HubSpot (optional)

### Setup

```bash
# Clone the repo
git clone https://github.com/justincheu/superai-2026.git
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
└── docs/                # Architecture & planning docs
```

## Agent Tools (16)

### Exa Search (5)
- **exa_people_search** — LinkedIn profile discovery at target companies
- **exa_company_deep_dive** — 8 parallel searches (funding, leadership, expansion, etc.)
- **exa_person_deep_dive** — 6-angle stakeholder profiling
- **exa_agentic_research** — Multi-step research via Exa Agent API
- **exa_answer** — Direct Q&A with citations

### Database (8)
- **db_write_contacts/signals/tasks/research_log** — Persist research findings
- **db_get_org / db_create_run / db_update_signal** — Read & update records
- **db_update_org** — Update org scores and scheduling

### Memory & CRM (3)
- **honcho_remember / honcho_recall** — Persistent agent memory across runs
- **hubspot_lookup** — Search existing CRM data before duplicate research

## Key Commands

```bash
pnpm dev          # Start Next.js dev server with Turbopack
pnpm build        # Production build
pnpm build:ash    # Build Ash agent
pnpm dev:ash      # Ash agent dev mode
pnpm typecheck    # TypeScript type checking
```

## License

[MIT](LICENSE) — SalesDuo Pte. Ltd.
