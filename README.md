# RevenueOS by SalesDuo

**Autonomous Account Agent, Purpose-Built for APAC**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **📋 [Judges — Read the Judging Guide →](docs/Judging.md)**
>
> Full breakdown of how RevenueOS meets every award criterion and judging dimension: AWS infrastructure, Vercel AI Gateway, Exa integration, Stripe billing, autonomy, self-learning, tool use, orchestration, and failure handling.

One agent per account. Runs autonomously in the background. Embedded in HubSpot. Adapts to whatever the account's current sales stage requires.

Built for the [SuperAI 2026 Hackathon](https://www.superai.com/next-hackathon).

## Thesis

**Human sellers. AI superpowers.**

AI handles the **Pre** (research, signals, briefings, warm paths) and the **Post** (drafts, CRM updates, tasks, follow-through). Humans own the **During**: every live buyer conversation.

## How It Works

1. **Add target accounts** — Enter company names or domains with your ICP criteria
2. **Agent researches autonomously** — 8-angle Exa company deep dives, 6-dimension stakeholder profiling, signal detection, people discovery
3. **Signals surface automatically** — Funding rounds, leadership changes, product launches — scored for ICP relevance with quoted stakeholder statements
4. **Get prioritized actions** — Who to contact, what to say, when to reach out — with rationale and opening lines
5. **Agent re-runs on its own** — Self-determined schedule (3/14/30 days). Self-learning via Honcho memory. Gets smarter every cycle.

## The Agent

- **Stage-adaptive** — reads the full account picture, plans what to do based on deal stage (prospecting → qualification → negotiation → stall → nurture)
- **16 tools** — Exa search (5), DB read/write (8), Honcho memory (2), HubSpot CRM (1)
- **Self-scheduling** — decides its own refresh interval based on ICP fit quality
- **Self-learning** — Honcho accumulates memory per account across runs
- **Market-aware** — per-country skills injected dynamically for APAC markets (Singapore, Australia, Indonesia, with architecture for 30+)

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

Hourly Cron → accounts where nextRunAt ≤ now → trigger fresh agent session
```

## Getting Started

```bash
git clone https://github.com/nika-lou/superai-2026.git
cd superai-2026
pnpm install
cp .env.example .env.local  # fill in API keys and DB credentials
pnpm dev
```

## Key Commands

```bash
pnpm dev          # Next.js dev server with Turbopack
pnpm build        # Production build
pnpm build:ash    # Build Ash agent
pnpm dev:ash      # Ash agent dev mode
pnpm typecheck    # TypeScript type checking
```

## License

[MIT](LICENSE) — [RevenueOS by SalesDuo](https://salesduo.io)
