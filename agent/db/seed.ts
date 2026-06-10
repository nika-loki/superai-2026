/**
 * RevenueOS — Seed Data
 *
 * Seeds the database with the demo workspace and target organisations.
 * Research output (signals, contacts, tasks, runs) is NOT seeded —
 * the agent produces real data when it runs.
 *
 * Usage:
 *   import { seedDemoData } from "./seed";
 *   await seedDemoData(db);
 *
 * Or standalone:
 *   pnpm tsx agent/db/seed.ts
 */

import {
  workspaces,
  organisations,
} from "./schema";
import { seedOrganisationMd } from "../../lib/s3";

// ---------------------------------------------------------------------------
// Demo workspace
// ---------------------------------------------------------------------------

const DEMO_WORKSPACE = {
  id: "10b28180-bd83-4a11-a06c-ff472c1718bd" as const,
  cognitoSub: "demo-user-001",
  name: "Demo User",
  email: "demo@revenueos.app",
};

// Organisation.md content — stored in S3 at <workspace_id>/org.md
const SELLER_ORGANISATION_MD = `# SalesDuo — Seller ICP & Go-to-Market Strategy

## Who We Are
SalesDuo (salesduo.io) is an AI-native sales intelligence platform purpose-built for APAC. We give human sellers AI superpowers — autonomously researching target accounts, surfacing buying signals, mapping buying committees, and recommending next-best-actions so sales teams spend less time on admin and more time closing.

**Tagline:** Human sellers. AI superpowers.

**Company:** SalesDuo Pte. Ltd. | Founded 2025 | Singapore | Solo founder | Bootstrapped

## Our Product (4 Pillars)

1. **Signal Monitoring** — Tracks buying signals across target markets: funding rounds, job posts, tech stack changes, annual report initiatives, press releases, and more.
2. **Contact Enrichment** — Waterfall enrichment across multiple providers for verified emails and phone numbers.
3. **Buying Committee Mapping** — Identifies decision-makers, champions, and influencers within target accounts.
4. **Account Scoring & Prioritisation** — Ranks accounts by buying readiness so reps know who to focus on each week.

**Unfair advantage:** The Sales Context Graph — an ontology of Organization, Person, Product, Deal, Signal, Interaction, and Decision that unifies email, WhatsApp, LinkedIn, and HubSpot into one living graph per seller.

## Ideal Customer Profile (ICP)

| Attribute | Detail |
|---|---|
| **Team size** | 4–20 person sales teams |
| **Stage** | Series A to C scale-ups |
| **Revenue** | $1M–$50M ARR |
| **Tech stack** | HubSpot-based (Salesforce planned) |
| **Geography** | Singapore / Southeast Asia HQ, often multi-country books |
| **Sales motion** | New logo + expansion, full-stack reps, relationship-driven, WhatsApp-heavy, consensus buying committees |
| **Industry** | B2B SaaS (horizontal — works across verticals because signals are event-driven, not industry-specific) |

**Buyer persona:** Head of Sales or Founder-CEO
**User persona:** Account Executive / full-stack rep
**Champion persona:** The rep who is tired of dropping balls

## Buying Signals We Care About
- **Funding**: Series A/B/C fundraise — growth-stage companies investing in sales scale and tooling
- **Expansion**: New market entry in APAC — need local market intelligence and multi-country account research
- **Product launches**: New enterprise product or feature — need to find and engage enterprise buyers
- **Leadership changes**: New VP+ hires in sales, partnerships, or revenue roles — new decision-makers open to new tools, want to prove ROI fast
- **Hiring signals**: Hiring SDRs, AEs, or sales engineers — scaling outbound means better prospecting tools needed
- **M&A activity**: Acquiring companies in new markets — need to ramp account knowledge fast
- **Annual report initiatives**: Public companies announcing strategic shifts visible in annual/quarterly reports
- **Tech stack changes**: Companies adopting new CRMs (especially HubSpot), communication tools, or sales engagement platforms

## Why These Signals Matter
- **Funding (Series A–C)** — post-product-market-fit companies investing in sales scale. They have budget and urgency.
- **Expansion in APAC specifically** — multi-country books are impossible to research manually. This is our wedge.
- **Hiring SDRs/AEs** — scaling outbound means they need better prospecting tools. The rep who just got hired is our champion.
- **Leadership changes** — new VP Sales wants to prove ROI fast, open to new tools. 90-day window to engage.
- **WhatsApp-heavy communication** — APAC reality that US tools ignore. We understand it natively.
- **Consensus buying committees** — APAC deals involve more stakeholders. Our buying committee mapping is purpose-built for this.

## Target Decision Makers
- **Head of Sales / VP Sales**: Budget owner for sales tooling. Primary buyer.
- **Founder-CEO**: Budget owner at sub-20-person companies. Often the one feeling the pain directly.
- **Head of RevOps / Sales Operations**: Operational buyer, implements and champions tooling.
- **CRO / Chief Revenue Officer**: Executive sponsor at larger orgs (Series B+).
- **Account Executives / Full-stack reps**: End users and champions — the ones tired of dropping balls.

## Engagement Strategy
1. **Lead with APAC market coverage** — we research 30+ markets they cannot cover manually, purpose-built for WhatsApp-heavy, relationship-driven, multi-country selling
2. **Show the agent in action** — live demo of autonomous research on THEIR target accounts
3. **Lead with signal-to-task pipeline** — prove we surface 5 clear actions each morning instead of 40 open tabs
4. **Economic argument** — "Don't hire your 6th rep for $60K/yr. Make your 5 existing reps AI-native for $30K/yr total."
5. **Timing matters most** — engage within 90 days of funding rounds, new market entries, or sales leadership changes

## Pricing
- **Starter**: $300/seat/month — Core briefing + drafts for 3–5 rep teams
- **Growth**: $500/seat/month — Multi-channel, warm paths, manager view
- **Scale**: $800+/seat/month — Full AI-native workflow + custom integrations

## Current Customers & Design Partners
- **Acme Corp** (example.com) — Insurtech
- **NovaTech** (example.com) — Document AI
- **MedFlow** (example.com) — Healthcare staffing
- **PeakEngage** (example.com) — Employee engagement platform
- **Design partner targets**: CloudSync, DataPulse, LaunchPad

## Competitive Landscape

| Competitor | Their approach | Our advantage |
|---|---|---|
| **ZoomInfo / Apollo** | US-centric data, weak APAC coverage | Purpose-built for APAC, 30+ markets, autonomous research |
| **LinkedIn Sales Navigator** | Manual process, no autonomous research | AI agent does the research autonomously, surfaces actions not data |
| **Clay / Smartlead** | Outbound automation, no intelligence layer | Intelligence-first with Sales Context Graph, not just volume |
| **6sense / Demandbase** | Intent data (website visits/keywords) | Real-world event signals with contextual analysis (funding, hiring, expansion) |
| **Gong / Clari** | Conversation intelligence, post-call analysis | Pre-call research + daily action, not just call analysis |
| **AI SDRs** (11x, Artisan) | Replace sellers with AI | Amplify sellers, not replace. Human sellers. AI superpowers. |

**Our category:** AI-Native Seller platform — not AI SDR, not replacement. We make existing reps 33% more effective without adding headcount.

## Integration Ecosystem
- **CRM**: HubSpot (live), Salesforce (planned)
- **Communication**: Email, WhatsApp, LinkedIn (via Unipile unified inbox)
- **Delivery channels**: Email, WhatsApp, Slack, Microsoft Teams, Web

## Q2 2026 Goals
- 5 active customers
- $1K MRR
- 1 published case study

## GTM Motion
- Founder-led sales (direct outbound)
- Design partner program with white-glove onboarding
- Content marketing: industry newsletter and blog
- Active LinkedIn presence by founding team
- Geographic wedge: SEA first, then ANZ, UK/Europe, North America
`;

// ---------------------------------------------------------------------------
// 5 APAC target organisations (no research output — agent produces that)
// ---------------------------------------------------------------------------

const DEMO_ORGS = [
  {
    id: "4c13ab96-56d3-43fd-b7e7-d87c8895bdbc" as const,
    name: "Grab",
    domain: "grab.com",
    hqCountry: "Singapore",
    icpDescription:
      "SEA super-app expanding GrabFin into B2B payments. Publicly traded, 10K+ employees. Key trigger: Vietnam fintech acquisition + new B2B payments platform launch. Strong ICP fit — building payment infrastructure across 8 APAC markets.",
    status: "onboarding" as const,
    properties: [
      { key: "industry", value: "Superapp / Fintech", type: "text" },
      { key: "employee_count", value: "10000+", type: "text" },
      { key: "funding_stage", value: "Public (GRAB)", type: "text" },
      { key: "revenue_usd", value: "2.4B (2025)", type: "text" },
      { key: "key_markets", value: "SG, ID, TH, VN, PH, MY, KH, MM", type: "text" },
    ],
  },
  {
    id: "b00ca719-8861-4215-ba10-6eba84ed2da8" as const,
    name: "Canva",
    domain: "canva.com",
    hqCountry: "Australia",
    icpDescription:
      "Global design SaaS with 170M+ users expanding into enterprise. $40B valuation, APAC HQ in Sydney. Key trigger: Enterprise AI Suite launch + Mitsubishi Japan partnership. Growing enterprise sales team in APAC.",
    status: "onboarding" as const,
    properties: [
      { key: "industry", value: "Design SaaS / Productivity", type: "text" },
      { key: "employee_count", value: "4000+", type: "text" },
      { key: "funding_stage", value: "Private ($40B valuation)", type: "text" },
      { key: "users", value: "170M+ MAU", type: "text" },
      { key: "hq", value: "Sydney, Australia", type: "text" },
    ],
  },
  {
    id: "25e5e422-4052-4c01-819f-7789b8a53f8f" as const,
    name: "Sea Group",
    domain: "seagroup.com",
    hqCountry: "Singapore",
    icpDescription:
      "Parent of Shopee, SeaMoney, Garena. 30K+ employees, publicly traded. Key trigger: $500M SeaMoney fundraise + embedded lending API launch. Expanding digital lending across SEA.",
    status: "onboarding" as const,
    properties: [
      { key: "industry", value: "E-commerce / Gaming / Fintech", type: "text" },
      { key: "employee_count", value: "30000+", type: "text" },
      { key: "funding_stage", value: "Public (SE)", type: "text" },
      { key: "subsidiaries", value: "Shopee, Garena, SeaMoney", type: "text" },
      { key: "revenue_usd", value: "13.1B (2025)", type: "text" },
    ],
  },
  {
    id: "6d530f24-7028-4e1b-81ab-270e1eef829e" as const,
    name: "Tokopedia",
    domain: "tokopedia.com",
    hqCountry: "Indonesia",
    icpDescription:
      "Indonesia's largest e-commerce marketplace (GoTo Group). 6K+ employees, 12M+ merchants. Key trigger: microservices migration + Tokopedia Pay QR launch + cross-border logistics expansion.",
    status: "onboarding" as const,
    properties: [
      { key: "industry", value: "E-commerce / Marketplace", type: "text" },
      { key: "employee_count", value: "6000+", type: "text" },
      { key: "funding_stage", value: "Part of GoTo (GOTO.JK)", type: "text" },
      { key: "merchants", value: "12M+", type: "text" },
      { key: "key_market", value: "Indonesia", type: "text" },
    ],
  },
  {
    id: "b165b06a-3b92-4aed-8160-f5fdb7feb1dd" as const,
    name: "Gojek",
    domain: "gojek.com",
    hqCountry: "Indonesia",
    icpDescription:
      "Indonesian super-app (GoTo Group) with GoPay B2B payments push. 8K+ employees. Key trigger: GoPay Business B2B payment rails launch + Philippines acquisition + 45% YoY financial services growth.",
    status: "onboarding" as const,
    properties: [
      { key: "industry", value: "Super-app / On-demand", type: "text" },
      { key: "employee_count", value: "8000+", type: "text" },
      { key: "funding_stage", value: "Part of GoTo (GOTO.JK)", type: "text" },
      { key: "services", value: "20+ on-demand services", type: "text" },
      { key: "key_market", value: "Indonesia", type: "text" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------

export async function seedDemoData(db: any): Promise<void> {
  console.log("Seeding RevenueOS database...");

  // 1. Create demo workspace
  await db.insert(workspaces).values(DEMO_WORKSPACE).onConflictDoNothing();
  console.log("  -> Created demo workspace");

  // 1b. Seed Organisation.md to S3
  await seedOrganisationMd(DEMO_WORKSPACE.id, SELLER_ORGANISATION_MD);

  // 2. Create organisations (target accounts only — no fake research output)
  for (const org of DEMO_ORGS) {
    await db
      .insert(organisations)
      .values({ ...org, workspaceId: DEMO_WORKSPACE.id })
      .onConflictDoNothing();
  }
  console.log(`  -> Created ${DEMO_ORGS.length} organisations`);

  console.log("Seeding complete. Run the agent to produce research data.");
}

// ---------------------------------------------------------------------------
// Standalone runner
// ---------------------------------------------------------------------------

async function main() {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const schema = await import("./schema");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool, { schema });

  try {
    await seedDemoData(db);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
