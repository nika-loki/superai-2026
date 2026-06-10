# Phases 3–6: Skills + Frontend + Stripe + Deploy

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Skills (market knowledge, prospecting, deal management, onboarding, initialisation), cron schedule, frontend dashboard with Shadcn, Stripe billing, seed data, and deploy.

---

## Phase 3: Context Engineering + Subagents + Skills (Tasks 3.1–3.8)

> **Architecture change:** Dynamic context is injected via Ash `defineDynamic` + `defineInstructions` — NOT via template string replacement. Skills are loaded ON DEMAND by the agent via `load_skill`. Subagents run in parallel with their own instructions + tools.

### Task 3.1: Dynamic instructions — 3 files (org-soul, honcho-recall, stage-context)

**Files:**
- Create: `agent/instructions/org-soul.ts`
- Create: `agent/instructions/honcho-recall.ts`
- Create: `agent/instructions/stage-context.ts`

These replace the old `buildResearchSystemPrompt()` helper. Ash injects them natively at runtime via `defineDynamic`.

**`agent/instructions/org-soul.ts`** — Injects Organisation.md once per session:

```ts
import { defineDynamic, defineInstructions } from "experimental-ash/instructions";
import { db } from "../lib/db.js";
import { organisations } from "../lib/db/schema.js";
import { eq } from "drizzle-orm";

export default defineDynamic({
  events: {
    async "session.started"(_event, ctx) {
      const orgId = (ctx.session as any).metadata?.orgId;
      if (!orgId) return null;

      const [org] = await db
        .select({
          name: organisations.name,
          domain: organisations.domain,
          hqCountry: organisations.hqCountry,
          organisationMd: organisations.organisationMd,
          properties: organisations.properties,
          opportunityScore: organisations.opportunityScore,
          status: organisations.status,
        })
        .from(organisations)
        .where(eq(organisations.id, orgId));

      if (!org) return null;

      const propsStr =
        org.properties && org.properties.length > 0
          ? org.properties.map((p: { key: string; value: string }) => `- **${p.key}**: ${p.value}`).join("\n")
          : "No structured properties yet.";

      const orgMd =
        org.organisationMd ??
        `Company: ${org.name}, Domain: ${org.domain}, Country: ${org.hqCountry}. No detailed Organisation.md yet — use general ICP analysis.`;

      console.log(
        `[org-soul] Injected Organisation.md for ${org.name} (${org.domain})`,
      );

      return defineInstructions({
        markdown:
          `# Your Seller's Identity (Organisation.md)\n\n${orgMd}\n\n` +
          `## Seller Properties\n${propsStr}\n\n` +
          `**Target Company:** ${org.name} (${org.domain}), HQ: ${org.hqCountry}\n` +
          `**Current Score:** ${org.opportunityScore ?? "Not yet scored"}\n` +
          `**Status:** ${org.status}`,
      });
    },
  },
});
```

**`agent/instructions/honcho-recall.ts`** — Injects accumulated memory once per session:

```ts
import { defineDynamic, defineInstructions } from "experimental-ash/instructions";
import { recallAccountMemory } from "../lib/honcho.js";

export default defineDynamic({
  events: {
    async "session.started"(_event, ctx) {
      const peerId = (ctx.session as any).metadata?.honchoPeerId;
      if (!peerId) {
        return defineInstructions({
          markdown:
            "# Accumulated Account Memory\n\n" +
            "No Honcho peer ID — this account has no prior memory. This is the first research run.",
        });
      }

      try {
        const memory = await recallAccountMemory(
          peerId,
          "Summarize everything known about this target account: " +
            "contacts found, signals detected, ICP fit assessment, " +
            "what worked, what didn't, stakeholder insights, market observations, " +
            "and any patterns across research runs.",
        );

        console.log(
          `[honcho-recall] Injected accumulated memory for peer ${peerId}`,
        );

        return defineInstructions({
          markdown: `# Accumulated Account Memory\n\n${memory}`,
        });
      } catch (err) {
        console.error("[honcho-recall] FAILED:", err);
        return defineInstructions({
          markdown:
            "# Accumulated Account Memory\n\n" +
            "Honcho recall failed. Proceed with caution — you may be re-researching known territory.",
        });
      }
    },
  },
});
```

**`agent/instructions/stage-context.ts`** — Injects current state per turn (stays fresh):

```ts
import { defineDynamic, defineInstructions } from "experimental-ash/instructions";
import { db } from "../lib/db.js";
import { contacts, signals, tasks } from "../lib/db/schema.js";
import { eq, and, count, desc } from "drizzle-orm";

export default defineDynamic({
  events: {
    async "turn.started"(_event, ctx) {
      const orgId = (ctx.session as any).metadata?.orgId;
      if (!orgId) return null;

      const [contactCount] = await db
        .select({ count: count() })
        .from(contacts)
        .where(eq(contacts.orgId, orgId));

      const [signalCount] = await db
        .select({ count: count() })
        .from(signals)
        .where(eq(signals.orgId, orgId));

      const [pendingTaskCount] = await db
        .select({ count: count() })
        .from(tasks)
        .where(and(eq(tasks.orgId, orgId), eq(tasks.status, "pending")));

      const isFirstRun = contactCount.count === 0 && signalCount.count === 0;

      let stageGuidance: string;
      if (isFirstRun) {
        stageGuidance =
          "**Stage: NEW PROSPECT** — This is the first research run.\n" +
          "- Load skill `stage-prospecting` for first-run procedures\n" +
          "- Load the matching market skill for the target's HQ country\n" +
          "- Delegate to both subagents for comprehensive parallel research";
      } else if (pendingTaskCount.count > 0) {
        stageGuidance =
          `**Stage: ACTIVE ENGAGEMENT** — ${contactCount.count} contacts, ${signalCount.count} signals, ${pendingTaskCount.count} pending tasks.\n` +
          "- Load skill `stage-active-deal` for deal progression\n" +
          "- Focus on what changed since last run\n" +
          "- Check for new signals at known contacts";
      } else {
        stageGuidance =
          `**Stage: REFRESH RUN** — ${contactCount.count} contacts, ${signalCount.count} signals, 0 pending tasks.\n` +
          "- Targeted refresh — look for changes since last run\n" +
          "- Prioritize finding new trigger events\n" +
          "- Load market skill for any cross-market expansion signals";
      }

      return defineInstructions({
        markdown: `# Current Account State\n\n${stageGuidance}`,
      });
    },
  },
});
```

**Commit:** `feat(instructions): add dynamic context injection — org soul, Honcho recall, stage context`

---

### Task 3.2: company-researcher subagent

**Files:**
- Create: `agent/subagents/company-researcher/agent.ts`
- Create: `agent/subagents/company-researcher/instructions.md`
- Create: `agent/subagents/company-researcher/tools/exa-company-deep-dive.ts`
- Create: `agent/subagents/company-researcher/tools/exa-answer.ts`
- Create: `agent/subagents/company-researcher/tools/db-write-signals.ts`

Specialized subagent for comprehensive company intelligence — multi-angle deep dive across funding, leadership, expansion, product, financials, regulatory, and competitive landscape.

**`agent/subagents/company-researcher/agent.ts`:**

```ts
import { defineAgent } from "experimental-ash";

export default defineAgent({
  description:
    "Deep-research a target company across all dimensions: funding rounds, " +
    "leadership changes, expansion plans, product launches, financial performance, " +
    "regulatory changes, and competitive landscape. " +
    "Use when you need comprehensive company intelligence.",
  model: "anthropic/claude-sonnet-4-20250514",
});
```

**`agent/subagents/company-researcher/instructions.md`:**

```markdown
# Company Intelligence Specialist

You are a specialist subagent focused on comprehensive company-level intelligence.

## Your Mission
Build a complete picture of the target company across all dimensions:

### Funding & Investment
- Recent funding rounds (amount, lead investor, valuation)
- Investment trends (is the company raising more or less?)
- Notable investors and what their involvement signals

### Leadership & People Strategy
- New C-suite hires or departures
- Board changes
- Key leadership moves (what does a new CTO hire signal about tech investment?)

### Expansion & Growth
- New offices, new markets, new verticals
- Partnership announcements
- M&A activity
- Hiring velocity and what roles they're hiring for

### Product & Strategy
- Recent product launches or feature announcements
- Strategic direction from earnings calls or press releases
- Technology choices and platform decisions

### Financial Performance
- Revenue, growth rate, profitability trends
- From financial reports, earnings, or credible estimates

### Regulatory & Compliance
- New licenses, approvals, or regulatory actions
- Government partnerships or grants

### Competitive Landscape
- How they position against competitors
- Market share shifts
- Competitive moats or vulnerabilities

## Your Tools
- `exa_company_deep_dive` — Runs 8 parallel searches across news, company, and financial
  report categories. Covers: funding, leadership, expansion, product, financial,
  regulatory, ICP-specific, and competitive angles.
- `exa_answer` — Ask specific factual questions with citations
- `db_write_signals` — Persist detected signals to the database

## Research Approach
1. Run `exa_company_deep_dive` with the company name, domain, and ICP description
2. For any signal that needs fact-checking or deeper investigation, use `exa_answer`
3. Persist ALL signals found via `db_write_signals`
4. Each signal MUST include: type, title, quotes (with sources), ICP relevance reasoning

## Source Attribution (MANDATORY)
EVERY signal must be backed by:
- The **exact source URL**
- The **specific paragraph or quote** confirming the signal

Examples:
- ✅ GOOD: "Grab raised $500M in a Series F extension led by Temasek, bringing
  valuation to $16B. The company stated: 'This funding will fuel our expansion into
  Indonesia's digital payments market.' [source: bloomberg.com/grab-series-f-2026]"
- ✅ GOOD: "New CTO Srinivas (ex-Google) was hired in March 2026, signaling a push
  into AI. In his first interview he said: 'We're building the region's most
  advanced AI infrastructure.' [source: techinasia.com/grab-new-cto-2026]"
- ❌ BAD: "Grab is expanding into Indonesia" (no source, no quote)

## Signal Quality
- Every signal needs at least 1 direct quote from a source
- Multi-source signals are stronger — mention if confirmed by multiple outlets
- Recent signals (< 30 days) are more valuable — note the date
- Always explain WHY this signal matters for the seller's ICP
- Include impact score (1-5) based on how strongly this signal maps to the ICP
```

**Tool re-exports** (thin wrappers sharing root implementations):

```ts
// agent/subagents/company-researcher/tools/exa-company-deep-dive.ts
export { default } from "../../../tools/exa-company-deep-dive.js";
```

```ts
// agent/subagents/company-researcher/tools/exa-answer.ts
export { default } from "../../../tools/exa-answer.js";
```

```ts
// agent/subagents/company-researcher/tools/db-write-signals.ts
export { default } from "../../../tools/db-write-signals.js";
```

**Commit:** `feat(subagent): add company-researcher with multi-angle deep dive tools`

---

### Task 3.3: people-researcher subagent

**Files:**
- Create: `agent/subagents/people-researcher/agent.ts`
- Create: `agent/subagents/people-researcher/instructions.md`
- Create: `agent/subagents/people-researcher/tools/exa-people-search.ts`
- Create: `agent/subagents/people-researcher/tools/exa-person-deep-dive.ts`
- Create: `agent/subagents/people-researcher/tools/exa-answer.ts`
- Create: `agent/subagents/people-researcher/tools/db-write-contacts.ts`

Specialized subagent for holistic stakeholder intelligence — not just events, but the full human picture.

**`agent/subagents/people-researcher/agent.ts`:**

```ts
import { defineAgent } from "experimental-ash";

export default defineAgent({
  description:
    "Discover and deeply profile key stakeholders at a target company. " +
    "Researches their priorities (from speeches, podcasts, articles), " +
    "upcoming events (speaking or attending), LinkedIn activity, " +
    "social interests and hobbies (for relationship building), " +
    "and role changes. Produces rich, human-level intelligence with sources.",
  model: "anthropic/claude-sonnet-4-20250514",
});
```

**`agent/subagents/people-researcher/instructions.md`:**

```markdown
# Stakeholder Intelligence Specialist

You are a specialist subagent focused on understanding PEOPLE — not just their
job titles, but who they are, what they care about, and how to connect with them.

## Your Mission
For each stakeholder at the target company, build a complete human profile:

### Professional Intelligence
- **Priorities**: What are they focused on based on recent speeches, talks, interviews?
- **Expertise**: What topics do they speak about? What podcasts have they been on?
- **Role trajectory**: Recent role changes? New to the company? Being promoted?
- **Buying influence**: Are they a champion, decision-maker, influencer, or blocker?

### Event & Engagement Intelligence
- **Upcoming events**: Are they speaking at or attending any conferences?
- **Past events**: Where have they spoken recently? What did they talk about?
- **Community**: Are they active in any professional communities or associations?

### Human Connection Intelligence
- **Interests & hobbies**: What do they post about beyond work? What causes do they support?
- **Social media presence**: What are they actively posting about on LinkedIn or other platforms?
- **Personal touches**: Anything useful for relationship building (shared interests, background)

## Your Tools
- `exa_people_search` — Find people via LinkedIn profile search
- `exa_person_deep_dive` — Deep research on a specific person (speeches, podcasts,
  events, social media, interests) — runs 6 parallel searches
- `exa_answer` — Ask specific factual questions about a person
- `db_write_contacts` — Persist contacts with rich properties

## Research Approach
1. Use `exa_people_search` with ICP-matching titles to discover stakeholders
2. For the MOST IMPORTANT contacts (C-suite, VPs, potential champions):
   - Run `exa_person_deep_dive` to build a holistic profile
   - Use `exa_answer` for any specific questions that need citations
3. For lower-priority contacts: capture basic info from the initial search
4. Persist ALL contacts via `db_write_contacts`

## Source Attribution (MANDATORY)
EVERY claim about a person must be backed by:
- The **exact source URL**
- The **specific paragraph or quote** you inferred from or directly extracted

Examples:
- ✅ GOOD: "Priorities likely include AI strategy expansion — inferred from his keynote
  at Asia Tech X 2026 where he said: 'We're investing heavily in building our AI
  capabilities across the region' [source: techinasia.com/asia-tech-x-2026-keynotes]"
- ✅ GOOD: "Likely a runner — posted about completing the Singapore Marathon on LinkedIn
  (Dec 2025). Could be a small-talk angle. [source: linkedin.com/posts/srinivas-grab-xyz]"
- ❌ BAD: "He is interested in AI" (no source, no quote)

## Contact Properties
For each contact, populate as many properties as you can discover:
- `location` — Where they're based
- `department` — Engineering, Product, Sales, etc.
- `tenure` — How long at the company
- `education` — University/degree
- `recent_talks` — Recent speaking engagements
- `interests` — Hobbies, passions, causes
- `priorities` — What they're focused on (inferred from public statements)
- `social_handles` — Twitter/X, LinkedIn, other social profiles
```

**Tool re-exports:**

```ts
// agent/subagents/people-researcher/tools/exa-people-search.ts
export { default } from "../../../tools/exa-people-search.js";
```

```ts
// agent/subagents/people-researcher/tools/exa-person-deep-dive.ts
export { default } from "../../../tools/exa-person-deep-dive.js";
```

```ts
// agent/subagents/people-researcher/tools/exa-answer.ts
export { default } from "../../../tools/exa-answer.js";
```

```ts
// agent/subagents/people-researcher/tools/db-write-contacts.ts
export { default } from "../../../tools/db-write-contacts.js";
```

**Commit:** `feat(subagent): add people-researcher with holistic stakeholder intelligence tools`

---

### Task 3.4: Hydrate hook (agent/hooks/hydrate.ts)

**Files:**
- Create: `agent/hooks/hydrate.ts`

Lifecycle hook for session logging and context hydration validation.

```ts
// agent/hooks/hydrate.ts
import { defineHook } from "experimental-ash/hooks";

export default defineHook({
  events: {
    async "session.started"(event, ctx) {
      const orgId = (ctx.session as any).metadata?.orgId;
      const peerId = (ctx.session as any).metadata?.honchoPeerId;

      console.info(
        `[hydrate] Session started — orgId=${orgId}, peerId=${peerId}`,
      );

      if (!orgId) {
        console.warn(
          "[hydrate] WARNING: No orgId in session metadata. Dynamic instructions will not inject org context.",
        );
      }
    },
    async "message.completed"(event) {
      console.info("[hydrate] Model finished", {
        length: event.data.message?.length ?? 0,
      });
    },
  },
});
```

**Commit:** `feat(hooks): add hydrate hook for session lifecycle logging`

---

### Task 3.5: Singapore market skill

**Files:**
- Create: `agent/skills/markets/singapore/SKILL.md`

```markdown
# Singapore Market Intelligence

## Market Context
- Business hub for Southeast Asia, English-speaking business environment
- Key industries: FinTech, SaaS, Logistics, E-commerce, Digital Banking
- Government incentives: MAS fintech sandbox, EDB grants, Startup SG
- Common titles: Managing Director, Head of, VP, Director, C-suite

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

## Exa Search Strategy
- Use `category: "linkedin profile"` for people search
- Use `category: "news"` with `startPublishedDate` (last 12 months) for signals
- Use `includeDomains: ["linkedin.com"]` for LinkedIn-scoped searches
- Use `category: "company"` for company research
```

**Commit:** `feat(skills): add Singapore market skill`

---

### Task 3.6: Indonesia market skill

**Files:**
- Create: `agent/skills/markets/indonesia/SKILL.md`

```markdown
# Indonesia Market Intelligence

## Market Context
- Largest economy in Southeast Asia, 270M+ population
- Key industries: E-commerce, Ride-hailing, Digital Payments, Logistics, EdTech
- Major players: GoTo (Gojek+Tokopedia), Bukalapak, Traveloka, Bank Jago
- Common titles: CEO, Co-Founder, Chief X Officer, VP, Director

## Research Parameters
- Search in English and Bahasa Indonesia keywords where relevant
- Look for: OJK licenses, e-wallet licenses, unicorn/decacorn status
- Events: Indonesia Fintech Summit, IDByte, Tech in Asia Jakarta

## Signal Types to Detect
- New OJK regulation or license approval
- Fundraising from major VC (Sequoia, SoftBank, Northstar)
- Regional expansion within Indonesia (tier-2/3 cities)
- Digital banking license activity

## Exa Search Strategy
- Use `category: "linkedin profile"` for people search
- Use `category: "news"` with Indonesia-specific keywords
- Watch for: "GoTo", "Tokopedia", "Gojek", "Bukalapak" as competitors/benchmarks
```

**Commit:** `feat(skills): add Indonesia market skill`

---

### Task 3.7: Stage skills — prospecting + active-deal

**Files:**
- Create: `agent/skills/stage-prospecting/SKILL.md`
- Create: `agent/skills/stage-active-deal/SKILL.md`

Two skills loaded on demand based on account stage. The agent sees these via `load_skill` and picks the right one.

**`agent/skills/stage-prospecting/SKILL.md`:**

```markdown
# First-Run / Prospecting Procedure

Load this skill when the account is a NEW PROSPECT (no prior research).

## Step 1: Review What You Have
- Organisation.md is injected (your seller's ICP)
- Market skill for the target's country should be loaded too
- No prior Honcho memory — this is fresh

## Step 2: Delegate Parallel Research
Delegate to BOTH subagents simultaneously:
1. **company-researcher** → "Research [company] for funding, expansion, regulatory signals"
2. **people-researcher** → "Find key stakeholders at [company] matching these ICP titles: [from Organisation.md]"

## Step 3: Synthesize Findings
After subagents return:
1. Score the account (0-100) based on ICP fit + signal strength
2. Create outreach tasks for the strongest signals
3. Update org via db_update_org (score + next run timing + status="active")

## Step 4: Persist Everything
1. `db_write_research_log` — Save run summary
2. `honcho_remember` — Write structured memory (Actions, Outcomes, Learnings, Key Observations)

## ICP Scoring
- 90-100: Exact industry, right size, 3+ active signals, champion identified
- 70-89: Close industry, right region, 2+ signals, senior stakeholder found
- 50-69: Adjacent industry or size, 1 signal, contacts but no champion
- 0-49: Wrong segment, no signals, generic contacts only
```

**`agent/skills/stage-active-deal/SKILL.md`:**

```markdown
# Active Deal / Refresh Research Procedure

Load this skill when the account already has contacts, signals, or tasks.

## Step 1: Review Existing State
- Organisation.md injected (seller's ICP)
- Honcho memory injected (what worked, what didn't, key observations)
- Stage context shows: X contacts, Y signals, Z pending tasks

## Step 2: Targeted Research
Focus on what CHANGED since last run:
1. **company-researcher** → "Find recent signals for [company] since [lastResearchedAt]"
2. **people-researcher** → "Check for role changes at [company] for known contacts + find any new stakeholders"

## Step 3: Signal-Task Pipeline
For each new signal that crosses the ICP threshold:
1. Create an outreach task with:
   - **What**: The signal type and details
   - **Evidence**: Direct quotes + sources
   - **Why Now**: ICP relevance + timing urgency
2. Link to the relevant contact if possible

## Step 4: Update & Remember
1. `db_update_org` — Adjust score, set next run timing
2. `db_write_research_log` — What changed, what's new
3. `honcho_remember` — Structured memory with focus on CHANGES and PATTERNS

## Key Patterns to Watch
- Champion job moves (leaving = risk, arriving = opportunity)
- Competitor activity near this account
- Regulatory changes that create urgency
- Budget cycle timing (look for fiscal year signals)
```

**Commit:** `feat(skills): add prospecting and active-deal stage skills`

---

### Task 3.8: Cron schedule (refresh-check.ts)

**Files:**
- Create: `agent/schedules/refresh-check.ts`

```ts
import { defineSchedule } from "experimental-ash";
import { db } from "../lib/db.js";
import { organisations, agentRuns } from "../lib/db/schema.js";
import { and, lte, eq } from "drizzle-orm";

export default defineSchedule({
  name: "refresh-check",
  cron: "0 * * * *", // hourly
  execute: async () => {
    console.log("[refresh-check] Checking for due organisations...");

    const dueOrgs = await db
      .select({
        id: organisations.id,
        name: organisations.name,
        honchoPeerId: organisations.honchoPeerId,
      })
      .from(organisations)
      .where(
        and(
          lte(organisations.nextRunAt, new Date()),
          eq(organisations.status, "active"),
        ),
      );

    if (dueOrgs.length === 0) {
      console.log("[refresh-check] No organisations due for research.");
      return;
    }

    console.log(
      `[refresh-check] Found ${dueOrgs.length} organisations due for research.`,
    );

    for (const org of dueOrgs) {
      const [run] = await db
        .insert(agentRuns)
        .values({
          orgId: org.id,
          status: "pending",
          startedAt: new Date(),
        })
        .returning();

      console.log(
        `[refresh-check] Created run ${run.id} for org ${org.name} — ` +
          `TODO: trigger Ash agent session with metadata: { orgId: "${org.id}", honchoPeerId: "${org.honchoPeerId}" }`,
      );

      // NOTE: Actual Ash session trigger depends on Ash's session API.
      // The session must be started with metadata containing orgId + honchoPeerId
      // so that the dynamic instructions (org-soul.ts, honcho-recall.ts) can inject context.
    }
  },
});
```

**Commit:** `feat(agent): add hourly refresh-check cron schedule with structured logging`

---

## Phase 4: Frontend — Notion-Style UI (Tasks 4.1–4.7)

> **Design language:** Notion-inspired — clean, minimal, lots of whitespace, subtle borders, sans-serif typography. Light mode default. No gradients, no shadows (except very subtle card borders). Neutral palette with a single accent color for primary actions.

### Task 4.1: Init Shadcn UI + Notion theme

**Install:**

```bash
npx shadcn@latest init -d
npx shadcn@latest add button card input label badge table tabs separator avatar dialog tooltip scroll-area collapsible
```

**Notion-style CSS variables** in `app/globals.css`:

```css
@theme {
  /* Notion palette */
  --color-bg: #ffffff;
  --color-bg-secondary: #f7f6f3;        /* Notion's warm off-white sidebar */
  --color-bg-hover: #f1f1ef;
  --color-border: #e3e2de;
  --color-border-light: #ebebea;
  --color-text-primary: #37352f;         /* Notion's ink */
  --color-text-secondary: #787774;
  --color-text-muted: #9b9a97;
  --color-accent: #2383e2;               /* Notion blue */
  --color-accent-hover: #1b6ec2;
  --color-red: #eb5757;
  --color-green: #4dab6f;
  --color-orange: #e49143;
  --color-yellow: #dfab01;
}
```

**Install Lucide icons** (for Globe, LinkedIn, Play icons):

```bash
pnpm add lucide-react
```

**Commit:** `feat(ui): init Shadcn + Notion-style theme + Lucide icons`

---

### Task 4.2: Dashboard — Account Agents Table (`app/page.tsx`)

**Files:**
- Modify: `app/page.tsx`
- Create: `components/dashboard/org-table.tsx`
- Create: `components/dashboard/org-table-row.tsx`

**Layout:** Full-width table view — Notion database style. No sidebar (full page).

**Table columns (left to right):**

| Column | Content | Width |
|---|---|---|
| Name | Org name (clickable link to `/org/[id]`) | flex-2 |
| Domain | `grab.com` — muted text | 140px |
| Country | Flag emoji + country name | 120px |
| ICP Score | Circular badge: green (80+), orange (50-79), red (<50) | 80px |
| Status | Pill badge: `active` / `onboarding` / `paused` | 100px |
| Last Run | Relative time ("2 hours ago", "3 days ago") | 120px |
| Signals | Count badge | 80px |

**Behavior:**
- Clicking any row navigates to `/org/[id]`
- No "Run Research" button on dashboard — that lives inside the org detail page
- Empty state: "No account agents yet" with subtle illustration placeholder
- Table header is sticky, rows have hover highlight (`--color-bg-hover`)

**Data fetching:** Server component reads from DB via `GET /api/orgs` or directly from Drizzle.

**Commit:** `feat(frontend): Notion-style dashboard with account agents table`

---

### Task 4.3: Org Detail Page — Header + Tabs (`app/org/[id]/page.tsx`)

**Files:**
- Create: `app/org/[id]/page.tsx`
- Create: `components/org/org-header.tsx`
- Create: `components/org/org-tabs.tsx`

**Page structure:**

```
┌─────────────────────────────────────────────────────────┐
│ ← Back to Dashboard                                      │
│                                                          │
│  Grab  🌐  LinkedIn  ICP: 92                            │
│  Singapore · grab.com · Active                           │
│                                            [▶ Run Agent] │
├─────────────────────────────────────────────────────────┤
│  Overview  │  Runs  │  Chat                              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [Tab content here]                                      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Header (top-left):**

```
<Org name>  <GlobeIcon linked to domain>  <LinkedInIcon linked to linkedin search>  <ICP Score badge>
<Country> · <domain> · <status pill>
```

- **Org name:** Large, bold, Notion title style (text-xl font-semibold, `--color-text-primary`)
- **Globe icon:** `lucide-react/Globe` — small (16px), muted, links to `https://{domain}` in new tab
- **LinkedIn icon:** `lucide-react/Linkedin` — small, muted, links to `https://linkedin.com/company/{domain-slug}`
- **ICP Score:** Pill badge with color coding (same as dashboard)
- **Meta line:** Smaller muted text with country, domain, status

**Header (top-right):**

- **"Run Agent" button:** Primary action. Notion blue (`--color-accent`), white text. Shows a loading spinner while run is active. Disables if a run is already in progress.

**Tabs:** Notion-style underline tabs (not pill/card tabs). Active tab has a 2px blue underline. Inactive tabs are muted text.

- **Overview** — Tasks + Signals (default active tab)
- **Runs** — Agent run timeline with live streaming
- **Chat** — Skeleton only (1:1 chat placeholder, not built for demo)

**Commit:** `feat(frontend): org detail page with header, tabs, and Run Agent button`

---

### Task 4.4: Overview Tab — Tasks + Signals (`components/org/overview-tab.tsx`)

**Files:**
- Create: `components/org/overview-tab.tsx`
- Create: `components/org/signals-list.tsx`
- Create: `components/org/tasks-list.tsx`

**Layout:** Two-column on desktop, stacked on mobile.

```
┌───────────────────────────┬───────────────────────────┐
│  Signals (4)              │  Tasks (2 pending)        │
│  ─────────────            │  ─────────────            │
│  ● Funding Round          │  ☐ Send outreach email    │
│    Grab raised $500M...   │    to Reuben Lai          │
│    Impact: ★★★★★         │    Priority: High         │
│                           │                           │
│  ● Leadership Change      │  ☐ Research deeper into   │
│    New CTO hired...       │    Vietnam acquisition    │
│    Impact: ★★★★          │    Priority: Medium       │
│                           │                           │
│  ● Product Launch         │                           │
│    Enterprise AI Suite    │                           │
│    Impact: ★★★            │                           │
└───────────────────────────┴───────────────────────────┘
```

**Signals list:**
- Each signal is a collapsible card (default: collapsed)
- Collapsed: type dot (color-coded) + title + impact stars
- Expanded: quotes with source links, ICP relevance reasoning, date
- Signal type colors: funding=green, leadership=blue, product=purple, expansion=orange, regulatory=red
- Sorted by `createdAt` desc

**Tasks list:**
- Each task shows: checkbox (status), description, priority badge, linked contact avatar
- Priority: High (red dot), Medium (orange dot), Low (grey dot)
- Status: pending=unchecked, in_progress=spinning, completed=checked green, skipped=strikethrough
- Clicking a task could expand to show rationale and payload (nice-to-have)

**Data fetching:** Client component fetches from API routes on mount.

**Commit:** `feat(frontend): overview tab with signals and tasks lists`

---

### Task 4.5: Runs Tab — Agent Timeline (`components/org/runs-tab.tsx`)

**Files:**
- Create: `components/org/runs-tab.tsx`
- Create: `components/org/run-timeline.tsx`
- Create: `components/org/run-timeline-item.tsx`

**Design:** NOT a chat view. This is a **collapsible timeline of agent actions** — think Notion's page history or Linear's activity feed.

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  Run #3 — June 9, 2026 10:30 AM              [▶ Live]  │
│  ───────────────────────────────────────────────────    │
│                                                         │
│  🔍 exa_company_deep_dive  "Grab funding, expansion..." │
│     → Found 8 results across funding, leadership, ...   │
│                                                         │
│  👤 exa_people_search  "CTO VP Engineering Grab"         │
│     → Discovered 5 contacts (2 C-Suite, 3 VP)           │
│                                                         │
│  📊 db_write_signals  "3 signals persisted"              │
│     → funding_round, leadership_change, expansion        │
│                                                         │
│  ✅ db_update_org  "Score: 92 → 95"                     │
│     → refreshIntervalDays: 3                            │
│                                                         │
│  ── Run Summary ────────────────────────────────────    │
│  42s · 12,500 tokens · 7 tools invoked                  │
│  "Strong ICP fit. Funding signal confirmed. Two         │
│   VP-level champions identified."                        │
│                                                         │
│  ▼ Run #2 — June 8, 2026 2:15 PM             [Done]    │
│  ▼ Run #1 — June 7, 2026 9:00 AM              [Done]    │
└─────────────────────────────────────────────────────────┘
```

**Timeline item structure (each tool call):**
- **Icon** — tool-type specific: 🔍 for search, 👤 for people, 📊 for signals, 💾 for db writes, 🧠 for honcho
- **Tool name** — monospace font, `--color-text-secondary`
- **Input summary** — truncated to 80 chars, muted
- **Output summary** — below the input, slightly indented, shows key results
- Collapsed by default for old runs, expanded for the current/live run

**Live run behavior:**
- When "Run Agent" is clicked, a new run section appears at the top with a pulsing `● Live` indicator
- Tool calls stream in real-time via Ash's `useAshAgent()` SSE hook
- Each tool call animates in (fade + slide down) as it arrives
- When run completes: `● Live` → `✓ Done`, summary fades in at the bottom
- Uses `scroll-area` to keep the timeline scrollable

**Past runs:**
- Collapsed by default — just shows: "Run #N — <date> — <status> — <duration>"
- Click to expand and see the full timeline of tool calls
- Fetched from DB via API route

**Commit:** `feat(frontend): runs tab with collapsible agent action timeline and live streaming`

---

### Task 4.6: API Routes

**Files:**
- Create: `app/api/orgs/route.ts`
- Create: `app/api/orgs/[id]/route.ts`
- Create: `app/api/orgs/[id]/contacts/route.ts`
- Create: `app/api/orgs/[id]/signals/route.ts`
- Create: `app/api/orgs/[id]/tasks/route.ts`
- Create: `app/api/orgs/[id]/runs/route.ts`

```
app/api/orgs/route.ts               — GET: list all orgs (for dashboard table)
app/api/orgs/[id]/route.ts          — GET: single org detail
app/api/orgs/[id]/contacts/route.ts — GET: contacts for org
app/api/orgs/[id]/signals/route.ts  — GET: signals for org
app/api/orgs/[id]/tasks/route.ts    — GET: tasks for org
app/api/orgs/[id]/runs/route.ts     — GET: agent runs for org (with tool call details)
```

All routes return JSON. Query params for filtering (e.g. `?status=pending` on tasks, `?limit=5` on signals).

**Commit:** `feat(api): add REST routes for orgs, contacts, signals, tasks, runs`

---

### Task 4.7: Auth middleware (Cognito JWT)

**Files:**
- Create: `middleware.ts`
- Create: `lib/cognito.ts`

Verify JWT from Cognito. Allow bypass with `DEMO_MODE=true` env var (for hackathon demo).

**Commit:** `feat(auth): add Cognito JWT middleware with demo bypass`

---

## Phase 5: Stripe (Tasks 5.1–5.3)

### Task 5.1: Stripe checkout + webhook

`lib/stripe.ts` + `app/api/stripe/checkout/route.ts` + `app/api/stripe/webhook/route.ts`. Handles `checkout.session.completed` and `invoice.paid`.

**Commit:** `feat(stripe): add checkout session and webhook handler`

---

### Task 5.2: Metered billing per run

`app/api/stripe/usage/route.ts` — reports usage to Stripe after each agent run.

**Commit:** `feat(stripe): add per-run metered usage reporting`

---

### Task 5.3: Billing portal page

`app/billing/page.tsx` — link to Stripe Customer Portal.

**Commit:** `feat(stripe): add billing portal page`

---

## Phase 6: Seed + Deploy (Tasks 6.1–6.3)

### Task 6.1: Seed script with hand-crafted Organisation.md

`agent/db/seed.ts` — 1 workspace, 5 orgs (Grab hero + Canva, Sea Group, Tokopedia, Gojek).

**Critical:** Each org gets a **hand-crafted `organisationMd`** (Soul.md) — this replaces the initialisation agent for the demo. The hero org (Grab) gets a rich, detailed Organisation.md with full ICP, signal categories, and search strategy. Set-dressing orgs get lighter profiles.

All orgs seeded with:
- `status: "active"`
- `honchoPeerId` (pre-generated UUID)
- `opportunityScore` (pre-assigned)
- `organisationMd` (hand-crafted markdown)
- `properties` (industry, employee_count, funding_stage, etc.)
- Completed agent runs, contacts with properties, signals, tasks

**Commit:** `feat(db): add seed script with hand-crafted Organisation.md for 5 demo orgs`

---

### Task 6.2: Demo mode fallback

`app/demo/page.tsx` — loads pre-recorded agent run JSON.

**Commit:** `hack: add demo mode fallback page for stage (revert after)`

---

### Task 6.3: Deploy to Vercel + AWS

```bash
pnpm drizzle-kit push    # Push schema to Aurora RDS
pnpm tsx agent/db/seed.ts # Seed demo data
vercel --prod             # Deploy to Vercel
```

Set all env vars in Vercel dashboard. Verify checklist from Goals.md.

**Commit:** `chore: deploy to production`

---

## Summary

| Phase | Tasks | Scope |
|---|---|---|
| 3. Context Engineering + Subagents + Skills | 3.1–3.8 | Dynamic instructions (3), subagents (2), hook, skills (4), cron |
| 4. Frontend (Notion-style) | 4.1–4.7 | Shadcn + theme, dashboard table, org detail (header+tabs), overview (signals+tasks), runs timeline (live streaming), API routes, auth |
| 5. Stripe | 5.1–5.3 | Checkout, webhook, metered billing, portal |
| 6. Seed + Deploy | 6.1–6.3 | Demo data (hand-crafted Org.md), fallback, deploy |

**20 tasks. Phases 3-4 depend on Phases 1-2. Phases 5-6 are independent.**
