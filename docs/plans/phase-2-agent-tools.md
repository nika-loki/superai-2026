# Phase 2: Agent Tools — 10 Tools with Real API Designs

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Depends on:** Phase 1 (schema and DB client must exist)

**Goal:** Build all 10 agent tools using actual Exa API (search, answer, contents), Honcho v3 SDK (peer.chat, session.addMessages), and Drizzle ORM. Each tool is one task.

**Key API facts from docs:**
- **Exa Search:** `POST /search` — `category` filter: `linkedin profile`, `company`, `news`, `financial report`. Shorthand: `text: true` at top level.
- **Exa Answer:** `POST /answer` — Returns `{ answer, citations[] }` with optional `text: true` for full citation text.
- **Exa Contents:** `POST /contents` — Get page contents by URL array.
- **Honcho v3:** `peer.chat(query)` for recall, `session.addMessages([peer.message(content)])` for remember. `session.context()` for structured context with `to_openai()` / `to_anthropic()` converters.

---

### Task 2.1: Exa client (agent/lib/exa.ts)

**Files:**
- Create: `agent/lib/exa.ts`
- Install: `pnpm add exa-js`

```ts
// agent/lib/exa.ts
// Exa API client — wraps exa-js SDK for search, answer, contents

import Exa from "exa-js";

export const exa = new Exa(process.env.EXA_API_KEY!);

// Type helpers for Exa responses
export interface ExaSearchResult {
  title: string;
  url: string;
  id: string;
  publishedDate?: string;
  author?: string;
  text?: string;
  highlights?: string[];
  highlightScores?: number[];
  summary?: string;
  score?: number;
  image?: string;
  favicon?: string;
}

export interface ExaAnswerResponse {
  answer: string;
  citations: Array<{
    id: string;
    url: string;
    title: string;
    author?: string;
    publishedDate?: string;
    text?: string;
    image?: string;
    favicon?: string;
  }>;
}

export interface ExaSearchResponse {
  requestId: string;
  resolvedSearchType: "neural" | "keyword";
  results: ExaSearchResult[];
  costDollars: { total: number };
}
```

**Commit:** `feat(lib): add Exa API client with typed responses`

---

### Task 2.2: Honcho client (agent/lib/honcho.ts)

**Files:**
- Create: `agent/lib/honcho.ts`
- Install: `pnpm add @honcho-ai/sdk`

From Honcho v3 docs: Peers are get-or-create. Sessions are per-run. `peer.chat(query)` for recall. `session.addMessages()` for remember.

```ts
// agent/lib/honcho.ts
// Honcho v3 client — per-account persistent memory

import { Honcho } from "@honcho-ai/sdk";

const WORKSPACE_ID = "revenueos";

export function getHonchoClient(): Honcho {
  return new Honcho({
    apiKey: process.env.HONCHO_API_KEY!,
    baseUrl: "https://api.honcho.dev",
    workspaceId: process.env.HONCHO_WORKSPACE_ID ?? WORKSPACE_ID,
  });
}

/**
 * Get or create a peer for an organisation.
 * Each org = one permanent peer. Cross-session memory is automatic.
 */
export function getOrgPeer(peerId: string) {
  const client = getHonchoClient();
  return client.peer(peerId);
}

/**
 * Recall accumulated knowledge about an account.
 * Uses peer.chat() — the most powerful retrieval method.
 * This is called BEFORE each agent run and injected into the system prompt.
 */
export async function recallAccountMemory(
  peerId: string,
  query: string,
): Promise<string> {
  const peer = getOrgPeer(peerId);
  const response = await peer.chat(query);
  return typeof response === "string" ? response : JSON.stringify(response);
}

/**
 * Get structured session context for system prompt injection.
 * Uses session.context() with to_anthropic() for direct LLM consumption.
 */
export async function getAccountContext(
  peerId: string,
  searchQuery: string,
  options?: { tokens?: number },
) {
  const client = getHonchoClient();
  const peer = client.peer(peerId);
  // Create a retrieval session to get cross-session knowledge
  const session = client.session(`recall-${Date.now()}`);
  await session.addPeers([peer]);

  return session.context({
    tokens: options?.tokens ?? 1500,
    peer_target: peerId,
    search_query: searchQuery,
    limit_to_session: false, // get cross-session knowledge
  });
}

/**
 * Store findings for an account after a research run.
 * Creates a session per run, adds messages that trigger background reasoning.
 */
export async function rememberAccountFindings(
  peerId: string,
  sessionId: string,
  content: string,
): Promise<void> {
  const client = getHonchoClient();
  const peer = client.peer(peerId);
  const session = client.session(sessionId);
  await session.addPeers([peer]);
  await session.addMessages([peer.message(content)]);
}

/**
 * Create a new session for a research run.
 * Returns session ID for use with rememberAccountFindings.
 */
export function createRunSession(runId: string) {
  const client = getHonchoClient();
  return client.session(`run-${runId}`);
}
```

**Commit:** `feat(lib): add Honcho v3 client with recall/remember/context methods`

---

### Task 2.3: exa_people_search tool

**Files:**
- Create: `agent/tools/exa-people-search.ts`

Uses `category: "linkedin profile"` + `includeDomains: ["linkedin.com"]` for targeted people search.

```ts
// agent/tools/exa-people-search.ts
import { defineTool } from "experimental-ash";
import { z } from "zod";
import { exa, type ExaSearchResult } from "../lib/exa.js";

export default defineTool({
  name: "exa_people_search",
  description:
    "Find ICP-matching people at a target company using Exa neural search. " +
    "Targets LinkedIn profiles specifically. Returns names, titles, LinkedIn URLs, " +
    "and extracted profile text for seniority/location analysis.",
  parameters: z.object({
    companyName: z.string().describe("Target company name (e.g. 'Grab')"),
    titles: z
      .array(z.string())
      .describe(
        "Job titles or roles to search for (e.g. ['CTO', 'VP Engineering', 'Head of Product'])",
      ),
    country: z
      .string()
      .optional()
      .describe("Country to scope search (e.g. 'Singapore')"),
    numResults: z.number().min(1).max(25).default(10),
  }),
  execute: async ({ companyName, titles, country, numResults }) => {
    const query = [
      companyName,
      titles.join(" "),
      country,
      "site:linkedin.com/in",
    ]
      .filter(Boolean)
      .join(" ");

    const response = await exa.searchAndContents(query, {
      type: "neural",
      category: "linkedin profile",
      numResults,
      text: true,
    });

    return (response.results as ExaSearchResult[]).map((r) => ({
      name: r.title ?? "",
      linkedinUrl: r.url ?? "",
      profileText: r.text?.slice(0, 500) ?? "",
      source: "exa",
      publishedDate: r.publishedDate,
    }));
  },
});
```

**Commit:** `feat(agent): add exa_people_search tool with linkedin profile category`

---

### Task 2.4: exa_company_deep_dive tool

**Files:**
- Create: `agent/tools/exa-company-deep-dive.ts`

Runs multiple parallel searches across different angles and Exa categories to build a comprehensive company intelligence picture: funding, leadership, expansion, product launches, financials, regulatory, competitive landscape.

```ts
// agent/tools/exa-company-deep-dive.ts
import { defineTool } from "experimental-ash";
import { z } from "zod";
import { exa, type ExaSearchResult } from "../lib/exa.js";

export default defineTool({
  name: "exa_company_deep_dive",
  description:
    "Deep-research a target company across all dimensions: funding rounds, " +
    "leadership changes, expansion plans, product launches, financial performance, " +
    "regulatory changes, competitive landscape, and strategic partnerships. " +
    "Runs multiple parallel searches across news, company, and financial report categories.",
  parameters: z.object({
    companyName: z.string().describe("Target company name"),
    domain: z.string().describe("Company domain for scoping"),
    icpDescription: z
      .string()
      .describe("ICP fit description to guide signal detection"),
    country: z.string().optional().describe("Country scope"),
  }),
  execute: async ({ companyName, domain, icpDescription, country }) => {
    const oneYearAgo = new Date(
      Date.now() - 365 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Parallel searches across multiple angles and categories
    const queries = [
      // Funding & investment
      {
        q: `${companyName} funding OR investment OR "series A" OR "series B" OR "series C" OR valuation OR raised ${country ?? ""}`,
        category: "news" as const,
      },
      // Leadership changes
      {
        q: `${companyName} "new CEO" OR "new CTO" OR appointed OR joined OR "hired as" OR "promoted to" OR leadership ${country ?? ""}`,
        category: "news" as const,
      },
      // Expansion & growth
      {
        q: `${companyName} expansion OR "new office" OR "entered market" OR launched OR partnership OR "joint venture" ${country ?? ""}`,
        category: "news" as const,
      },
      // Product & strategy
      {
        q: `${companyName} product OR platform OR feature OR roadmap OR strategy OR announced ${country ?? ""}`,
        category: "news" as const,
      },
      // Financial reports & performance
      {
        q: `${companyName} revenue OR earnings OR "annual report" OR financial OR profit OR growth ${country ?? ""}`,
        category: "financial report" as const,
      },
      // Regulatory & compliance
      {
        q: `${companyName} license OR regulation OR compliance OR approved OR "MAS" OR "OJK" OR government ${country ?? ""}`,
        category: "news" as const,
      },
      // ICP-specific signals
      {
        q: `${companyName} ${icpDescription.slice(0, 120)}`,
        category: "company" as const,
      },
      // Competitive landscape
      {
        q: `${companyName} competitor OR "market share" OR "vs" OR rivalry OR benchmark ${country ?? ""}`,
        category: "news" as const,
      },
    ];

    const allResults = await Promise.all(
      queries.map(({ q, category }) =>
        exa
          .searchAndContents(q, {
            type: "neural",
            category,
            numResults: 5,
            startPublishedDate: oneYearAgo,
            text: true,
            summary: true,
          })
          .then((r) => (r.results as ExaSearchResult[]))
          .catch(() => [] as ExaSearchResult[]),
      ),
    );

    // Deduplicate by URL
    const seen = new Set<string>();
    const deduped = allResults
      .flat()
      .filter((r) => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      });

    return deduped.map((r) => ({
      title: r.title ?? "",
      url: r.url,
      text: r.text?.slice(0, 1500) ?? "",
      summary: r.summary ?? "",
      publishedDate: r.publishedDate,
      author: r.author,
    }));
  },
});
```

**Commit:** `feat(agent): add exa_company_deep_dive tool with multi-category parallel searches`

---

### Task 2.5: exa_person_deep_dive tool

**Files:**
- Create: `agent/tools/exa-person-deep-dive.ts`

Runs multiple parallel searches to build a holistic profile of a specific person: speeches, podcasts, conference attendance, LinkedIn activity, social media presence, interests, and priorities. The agent decides what angles to pursue.

```ts
// agent/tools/exa-person-deep-dive.ts
import { defineTool } from "experimental-ash";
import { z } from "zod";
import { exa, type ExaSearchResult } from "../lib/exa.js";

export default defineTool({
  name: "exa_person_deep_dive",
  description:
    "Deep-research a specific person: find their speeches, podcast appearances, " +
    "conference attendance, LinkedIn posts, social media activity, interests, and " +
    "priorities. Runs multiple parallel searches to build a holistic profile. " +
    "Use after exa_people_search identifies a contact worth profiling deeply.",
  parameters: z.object({
    personName: z.string().describe("Full name of the person to research"),
    company: z.string().describe("Their company (for disambiguation)"),
    title: z.string().optional().describe("Their job title (helps disambiguation)"),
  }),
  execute: async ({ personName, company, title }) => {
    const sixMonthsAgo = new Date(
      Date.now() - 180 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Parallel searches across multiple angles
    const queries = [
      // Speeches and talks
      {
        q: `"${personName}" ${company} speech OR keynote OR talk OR presentation OR panel`,
        category: "news" as const,
      },
      // Podcast appearances
      {
        q: `"${personName}" ${company} podcast OR interview OR " fireside " OR "conversation with"`,
        category: "news" as const,
      },
      // Conference and event attendance
      {
        q: `"${personName}" ${company} conference OR summit OR event OR attending OR speaker`,
        category: "news" as const,
      },
      // LinkedIn activity and posts
      {
        q: `"${personName}" ${title ?? ""} ${company} site:linkedin.com`,
        category: "linkedin profile" as const,
      },
      // Social media, interests, hobbies
      {
        q: `"${personName}" ${company} hobby OR interest OR passion OR "cares about" OR volunteer OR board`,
        category: "news" as const,
      },
      // Recent news mentions (priorities, opinions)
      {
        q: `"${personName}" ${company} said OR announced OR opinion OR priority OR "focused on"`,
        category: "news" as const,
      },
    ];

    const allResults = await Promise.all(
      queries.map(({ q, category }) =>
        exa
          .searchAndContents(q, {
            type: "neural",
            category,
            numResults: 5,
            startPublishedDate: sixMonthsAgo,
            text: true,
            summary: true,
          })
          .then((r) => (r.results as ExaSearchResult[]))
          .catch(() => [] as ExaSearchResult[]),
      ),
    );

    // Deduplicate by URL, flatten
    const seen = new Set<string>();
    const deduped = allResults
      .flat()
      .filter((r) => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      });

    return deduped.map((r) => ({
      title: r.title ?? "",
      url: r.url,
      text: r.text?.slice(0, 1500) ?? "",
      summary: r.summary ?? "",
      publishedDate: r.publishedDate,
      author: r.author,
    }));
  },
});
```

**Commit:** `feat(agent): add exa_person_deep_dive tool for holistic stakeholder profiling`

---

### Task 2.6: exa_answer tool (NEW)

**Files:**
- Create: `agent/tools/exa-answer.ts`

Uses the `/answer` endpoint for direct Q&A with citations. Great for specific factual questions.

```ts
// agent/tools/exa-answer.ts
import { defineTool } from "experimental-ash";
import { z } from "zod";
import { exa } from "../lib/exa.js";

export default defineTool({
  name: "exa_answer",
  description:
    "Ask a specific question and get an answer with citations. " +
    "Use for factual queries like 'What is Grab's latest funding round?' or " +
    "'Who is the CTO of Sea Group?'. Returns an answer plus source citations.",
  parameters: z.object({
    query: z
      .string()
      .describe(
        "Specific question to answer (e.g. 'What is the latest valuation of Grab?')",
      ),
  }),
  execute: async ({ query }) => {
    const response = await exa.answer(query, { text: true });

    return {
      answer: (response as any).answer ?? "",
      citations: ((response as any).citations ?? []).map(
        (c: Record<string, unknown>) => ({
          url: c.url,
          title: c.title,
          text: c.text ?? "",
          publishedDate: c.publishedDate,
        }),
      ),
    };
  },
});
```

**Commit:** `feat(agent): add exa_answer tool for Q&A with citations`

---

### Task 2.7: db_write_contacts tool

**Files:**
- Create: `agent/tools/db-write-contacts.ts`

Updated: no seniority enum, uses properties JSONB.

```ts
// agent/tools/db-write-contacts.ts
import { defineTool } from "experimental-ash";
import { z } from "zod";
import { db } from "../lib/db.js";
import { contacts } from "../lib/db/schema.js";

export default defineTool({
  name: "db_write_contacts",
  description:
    "Persist discovered contacts to Aurora RDS. Deduplicates by (orgId, linkedinUrl). " +
    "Seniority is free text (e.g. 'C-Suite', 'VP', 'Head of Engineering'). " +
    "Use properties for extra data: location, department, tenure, etc.",
  parameters: z.object({
    orgId: z.string().uuid(),
    agentRunId: z.string().uuid().optional(),
    contacts: z.array(
      z.object({
        name: z.string(),
        title: z.string().optional(),
        linkedinUrl: z.string().optional(),
        email: z.string().optional(),
        seniority: z
          .string()
          .optional()
          .describe(
            "Free text: 'C-Suite', 'VP', 'Director', 'Head of Engineering', etc.",
          ),
        relevanceNote: z.string().optional(),
        properties: z
          .array(
            z.object({
              key: z.string(),
              value: z.string(),
              type: z.enum(["text", "number", "url", "date"]),
            }),
          )
          .optional()
          .describe(
            "Extra properties: location, department, tenure, phone, etc.",
          ),
      }),
    ),
  }),
  execute: async ({ orgId, agentRunId, contacts: contactList }) => {
    const rows = contactList.map((c) => ({
      orgId,
      agentRunId: agentRunId ?? null,
      name: c.name,
      title: c.title ?? null,
      linkedinUrl: c.linkedinUrl ?? null,
      email: c.email ?? null,
      seniority: c.seniority ?? "unknown",
      properties: c.properties ?? [],
      relevanceNote: c.relevanceNote ?? null,
    }));
    const result = await db
      .insert(contacts)
      .values(rows)
      .onConflictDoNothing()
      .returning();
    return { inserted: result.length, total: contactList.length };
  },
});
```

**Commit:** `feat(agent): add db_write_contacts tool with JSONB properties`

---

### Task 2.8: db_write_signals tool

**Files:**
- Create: `agent/tools/db-write-signals.ts`

Unchanged from original — already uses dynamic text types.

```ts
// agent/tools/db-write-signals.ts
import { defineTool } from "experimental-ash";
import { z } from "zod";
import { db } from "../lib/db.js";
import { signals } from "../lib/db/schema.js";

export default defineTool({
  name: "db_write_signals",
  description:
    "Persist detected signals with dynamic type, quotes, ICP relevance, and multi-source URLs.",
  parameters: z.object({
    orgId: z.string().uuid(),
    agentRunId: z.string().uuid().optional(),
    signals: z.array(
      z.object({
        type: z
          .string()
          .describe(
            "Dynamic signal type from ICP (e.g. 'funding_round', 'leadership_change')",
          ),
        title: z.string(),
        quotes: z.array(
          z.object({
            text: z.string(),
            speaker: z.string().optional(),
            source: z.string().optional(),
          }),
        ),
        icpRelevance: z
          .string()
          .describe("Why this signal matters for the user's ICP"),
        sources: z.array(
          z.object({
            url: z.string(),
            title: z.string(),
            publishedDate: z.string().optional(),
          }),
        ),
        impact: z.number().min(1).max(5).optional(),
        contactId: z.string().uuid().optional(),
      }),
    ),
  }),
  execute: async ({ orgId, agentRunId, signals: signalList }) => {
    const rows = signalList.map((s) => ({
      orgId,
      agentRunId: agentRunId ?? null,
      contactId: s.contactId ?? null,
      type: s.type,
      title: s.title,
      quotes: s.quotes,
      icpRelevance: s.icpRelevance,
      sources: s.sources,
      impact: s.impact ?? null,
    }));
    const result = await db.insert(signals).values(rows).returning();
    return { inserted: result.length };
  },
});
```

**Commit:** `feat(agent): add db_write_signals tool`

---

### Task 2.9: db_write_research_log tool

**Files:**
- Create: `agent/tools/db-write-research-log.ts`

```ts
// agent/tools/db-write-research-log.ts
import { defineTool } from "experimental-ash";
import { z } from "zod";
import { db } from "../lib/db.js";
import { agentRuns } from "../lib/db/schema.js";
import { eq } from "drizzle-orm";

export default defineTool({
  name: "db_write_research_log",
  description:
    "Update agent_runs record with summary, ICP fit score, and recommended actions after research completes.",
  parameters: z.object({
    runId: z.string().uuid(),
    summary: z.string(),
    icpFitScore: z.number().min(0).max(100),
    recommendedActions: z
      .array(
        z.object({
          action: z.string(),
          priority: z.number(),
          rationale: z.string(),
        }),
      )
      .optional(),
    toolsInvoked: z.number().optional(),
    durationMs: z.number().optional(),
    tokensUsed: z.number().optional(),
  }),
  execute: async ({ runId, ...updates }) => {
    const [updated] = await db
      .update(agentRuns)
      .set({
        ...updates,
        status: "completed",
        completedAt: new Date(),
      })
      .where(eq(agentRuns.id, runId))
      .returning();
    return updated;
  },
});
```

**Commit:** `feat(agent): add db_write_research_log tool`

---

### Task 2.10: db_update_org tool

**Files:**
- Create: `agent/tools/db-update-org.ts`

Updated: can write to `organisationMd` and `properties`.

```ts
// agent/tools/db-update-org.ts
import { defineTool } from "experimental-ash";
import { z } from "zod";
import { db } from "../lib/db.js";
import { organisations } from "../lib/db/schema.js";
import { eq } from "drizzle-orm";

export default defineTool({
  name: "db_update_org",
  description:
    "Update organisation record: opportunityScore, nextRunAt, refreshIntervalDays, status, " +
    "organisationMd (Soul.md), properties.",
  parameters: z.object({
    orgId: z.string().uuid(),
    opportunityScore: z.number().min(0).max(100).optional(),
    refreshIntervalDays: z
      .number()
      .describe(
        "Days until next research run (3 for strong fit, 14 for moderate, 30 for poor)",
      ),
    status: z.enum(["onboarding", "active", "paused", "churned"]).optional(),
    organisationMd: z
      .string()
      .optional()
      .describe("Updated Organisation.md (backbone ICP profile)"),
    properties: z
      .array(
        z.object({
          key: z.string(),
          value: z.string(),
          type: z.enum(["text", "number", "url", "date"]),
        }),
      )
      .optional()
      .describe("Dynamic properties to set on the organisation"),
  }),
  execute: async ({
    orgId,
    opportunityScore,
    refreshIntervalDays,
    status,
    organisationMd,
    properties,
  }) => {
    const now = new Date();
    const nextRunAt = new Date(
      now.getTime() + refreshIntervalDays * 24 * 60 * 60 * 1000,
    );
    const [updated] = await db
      .update(organisations)
      .set({
        ...(opportunityScore !== undefined && { opportunityScore }),
        refreshIntervalDays,
        nextRunAt,
        lastResearchedAt: now,
        ...(status && { status }),
        ...(organisationMd && { organisationMd }),
        ...(properties && { properties }),
        updatedAt: now,
      })
      .where(eq(organisations.id, orgId))
      .returning();
    return updated;
  },
});
```

**Commit:** `feat(agent): add db_update_org tool with Organisation.md and properties`

---

### Task 2.11: honcho_remember tool

**Files:**
- Create: `agent/tools/honcho-remember.ts`

```ts
// agent/tools/honcho-remember.ts
import { defineTool } from "experimental-ash";
import { z } from "zod";
import { rememberAccountFindings } from "../lib/honcho.js";

export default defineTool({
  name: "honcho_remember",
  description:
    "Store findings in Honcho memory for this account. " +
    "Accumulates across all research runs. Background reasoning auto-generates conclusions. " +
    "These memories are recalled and injected into the system prompt before every future run.",
  parameters: z.object({
    peerId: z
      .string()
      .describe("Organisation's Honcho peer ID (honchoPeerId)"),
    sessionId: z
      .string()
      .describe("Session ID for this run (use run-${runId})"),
    content: z
      .string()
      .describe("Key findings and learnings to remember"),
  }),
  execute: async ({ peerId, sessionId, content }) => {
    await rememberAccountFindings(peerId, sessionId, content);
    return { remembered: true, peerId, sessionId };
  },
});
```

**Commit:** `feat(agent): add honcho_remember tool using Honcho v3 session.addMessages`

---

### Task 2.12: honcho_recall tool (runtime-injected, also available as tool)

**Files:**
- Create: `agent/tools/honcho-recall.ts`

```ts
// agent/tools/honcho-recall.ts
import { defineTool } from "experimental-ash";
import { z } from "zod";
import { recallAccountMemory } from "../lib/honcho.js";

export default defineTool({
  name: "honcho_recall",
  description:
    "Retrieve accumulated knowledge from all prior research runs on this account. " +
    "Note: accumulated memory is ALSO injected into the system prompt before each run. " +
    "Use this tool for targeted recall of specific topics during the run.",
  parameters: z.object({
    peerId: z
      .string()
      .describe("Organisation's Honcho peer ID"),
    query: z
      .string()
      .describe("What to recall about this account (e.g. 'prior funding signals')"),
  }),
  execute: async ({ peerId, query }) => {
    const memory = await recallAccountMemory(peerId, query);
    return memory;
  },
});
```

**Commit:** `feat(agent): add honcho_recall tool using Honcho v3 peer.chat`

---

### Task 2.13: exa_agentic_research tool (Exa Agent API)

**Files:**
- Create: `agent/tools/exa-agentic-research.ts`

Uses the **Exa Agent API** (`/agent/runs`) for deep, structured, multi-hop research. Unlike the search tools which are synchronous and targeted, Exa Agent is async, runs its own internal reasoning loop across dozens of searches, and returns **schema-validated JSON with field-level grounding citations**.

**When the agent should use this tool:**
- Deep company research requiring structured output across many fields
- Multi-hop research like "find companies → find their decision-makers → enrich each"
- List building from open-ended criteria
- Enrichment of existing data with `input.data`
- Any task that would need 5+ separate search calls can be done in one Agent run

**When the agent should NOT use this tool:**
- Quick targeted lookups (use `exa_answer`)
- Real-time searches during subagent parallel execution (use `exa_company_deep_dive` / `exa_person_deep_dive`)
- Simple people search (use `exa_people_search`)

**Beta note:** Exa Agent is in beta. Requires `Exa-Beta: agent-2026-05-07` header (handled by SDK via `betas` param).

```ts
// agent/tools/exa-agentic-research.ts
import { defineTool } from "experimental-ash";
import { z } from "zod";
import Exa from "exa-js";

// JSON Schema type for outputSchema
const jsonSchemaValue = z.record(z.unknown());

export default defineTool({
  name: "exa_agentic_research",
  description:
    "Run deep, structured research via Exa Agent. Handles multi-hop reasoning " +
    "internally — finds, enriches, and cross-references data across dozens of searches. " +
    "Returns schema-validated JSON with grounding citations. " +
    "Use for: company deep research, stakeholder list building, multi-entity enrichment, " +
    "or any task that would need 5+ separate search calls. " +
    "NOT for: quick lookups (use exa_answer) or real-time targeted search (use deep_dive tools). " +
    "This tool is ASYNC — it polls until the Exa Agent run completes.",
  parameters: z.object({
    query: z
      .string()
      .describe(
        "What to research. Be specific and detailed. " +
        "Examples: 'Find all VP-level engineering leaders at Grab who have spoken at " +
        "conferences in the last year, with their talk topics and LinkedIn URLs.' " +
        "'Produce a comprehensive research brief on Sea Group covering funding, leadership, " +
        "expansion, and competitive landscape with source URLs.'",
      ),
    outputSchema: z
      .record(z.unknown())
      .optional()
      .describe(
        "JSON Schema for the desired output structure. " +
        "When provided, the response contains validated JSON in output.structured. " +
        "Example: { type: 'object', properties: { people: { type: 'array', items: { ... } } } }",
      ),
    inputData: z
      .array(z.record(z.unknown()))
      .optional()
      .describe(
        "Rows to process/enrich. Example: [{ company: 'Grab', domain: 'grab.com' }]. " +
        "Agent researches each row and adds fields per outputSchema.",
      ),
    exclusions: z
      .array(z.record(z.unknown()))
      .optional()
      .describe(
        "Entities to exclude from results. " +
        "Example: [{ name: 'John Doe' }] to skip already-known contacts.",
      ),
    effort: z
      .enum(["low", "medium", "high", "xhigh", "auto"])
      .default("auto")
      .describe(
        "Cost/reasoning effort. low=$0.025, medium=$0.10, high=$0.50, xhigh=$1.00 per run. " +
        "auto lets Exa decide. Default: auto.",
      ),
    previousRunId: z
      .string()
      .optional()
      .describe(
        "ID of a previous Exa Agent run to continue from. " +
        "Enables follow-up queries like 'narrow that list to Singapore-based only'.",
      ),
  }),
  execute: async ({
    query,
    outputSchema,
    inputData,
    exclusions,
    effort,
    previousRunId,
  }) => {
    const exa = new Exa(process.env.EXA_API_KEY!);

    console.log(`[exa-agentic-research] Starting: "${query.slice(0, 100)}..."`);

    const createParams: Record<string, unknown> = {
      betas: ["agent-2026-05-07"],
      query,
      effort: effort ?? "auto",
    };

    if (outputSchema) {
      createParams.outputSchema = outputSchema;
    }

    if (inputData) {
      createParams.input = { data: inputData };
    }

    if (exclusions) {
      createParams.input = {
        ...(createParams.input as object),
        exclusion: exclusions,
      };
    }

    if (previousRunId) {
      createParams.previousRunId = previousRunId;
    }

    try {
      const run = await (exa as any).beta.agent.runs.create(createParams);

      console.log(
        `[exa-agentic-research] Run created: ${run.id}, status: ${run.status}`,
      );

      // Poll until completion
      const completed = await (exa as any).beta.agent.runs.pollUntilFinished(
        run.id,
        {
          betas: ["agent-2026-05-07"],
          pollInterval: 4000,
        },
      );

      console.log(
        `[exa-agentic-research] Completed: ${completed.id}, ` +
          `cost: $${completed.costDollars?.total ?? "unknown"}`,
      );

      return {
        id: completed.id,
        status: completed.status,
        text: completed.output?.text ?? null,
        structured: completed.output?.structured ?? null,
        grounding: completed.output?.grounding ?? null,
        costDollars: completed.costDollars,
      };
    } catch (err: any) {
      console.error(
        `[exa-agentic-research] FAILED: ${err.message}`,
      );
      return {
        id: null,
        status: "failed",
        error: err.message,
        text: null,
        structured: null,
      };
    }
  },
});
```

**Commit:** `feat(agent): add exa_agentic_research tool using Exa Agent API for deep structured research`

---

## Summary

| # | Tool | File | API |
|---|---|---|---|
| 2.1 | Exa client | `agent/lib/exa.ts` | exa-js SDK |
| 2.2 | Honcho client | `agent/lib/honcho.ts` | @honcho-ai/sdk v3 |
| 2.3 | exa_people_search | `agent/tools/exa-people-search.ts` | Exa `/search` category:linkedin profile |
| 2.4 | exa_company_deep_dive | `agent/tools/exa-company-deep-dive.ts` | Exa `/search` multi-category parallel (news+company+financial) |
| 2.5 | exa_person_deep_dive | `agent/tools/exa-person-deep-dive.ts` | Exa `/search` multi-angle parallel, holistic person profile |
| 2.6 | exa_answer | `agent/tools/exa-answer.ts` | Exa `/answer` |
| 2.7 | db_write_contacts | `agent/tools/db-write-contacts.ts` | Drizzle, JSONB properties |
| 2.8 | db_write_signals | `agent/tools/db-write-signals.ts` | Drizzle, dynamic types |
| 2.9 | db_write_research_log | `agent/tools/db-write-research-log.ts` | Drizzle |
| 2.10 | db_update_org | `agent/tools/db-update-org.ts` | Drizzle, Organisation.md + properties |
| 2.11 | honcho_remember | `agent/tools/honcho-remember.ts` | Honcho v3 session.addMessages |
| 2.12 | honcho_recall | `agent/tools/honcho-recall.ts` | Honcho v3 peer.chat |
| 2.13 | **exa_agentic_research** | `agent/tools/exa-agentic-research.ts` | **Exa Agent `/agent/runs` — async deep structured research** |

**13 tasks. Depends on Phase 1.**

---

## Tool Ownership — Root Agent vs Subagents

Tools are defined once in `agent/tools/` but only SOME are available to the root agent. Subagents have their own tool directories that reference the shared implementations.

### Root Agent Tools (available to the orchestrator)
| Tool | Purpose |
|---|---|
| `exa_agentic_research` | Deep structured research — multi-hop, async, returns validated JSON with grounding citations |
| `exa_answer` | Quick factual Q&A with citations |
| `db_write_research_log` | Write final run summary |
| `db_update_org` | Score + schedule next run |
| `honcho_remember` | Store structured memory after every run |
| `honcho_recall` | Targeted mid-run recall |

### company-researcher Subagent Tools
| Tool | Purpose |
|---|---|
| `exa_company_deep_dive` | Multi-angle company intelligence (funding, leadership, expansion, financials, regulatory, competitive) |
| `exa_answer` | Factual Q&A about company |
| `db_write_signals` | Persist detected signals |

### people-researcher Subagent Tools
| Tool | Purpose |
|---|---|
| `exa_people_search` | Discover contacts at target company |
| `exa_person_deep_dive` | Holistic profiling: speeches, podcasts, events, social, interests |
| `exa_answer` | Factual Q&A about a person |
| `db_write_contacts` | Persist discovered contacts with properties |

**Implementation pattern:** Each subagent's `tools/` directory contains thin re-export files that import from the root `agent/tools/`. The tool logic is defined once, shared across agents.

```ts
// agent/subagents/company-researcher/tools/exa-company-deep-dive.ts
export { default } from "../../../tools/exa-company-deep-dive.js";
```
