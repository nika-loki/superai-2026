---
description: "Guide for researching a new or under-researched target account. Provides research strategy, quality criteria, and persistence guidance — the agent plans its own approach."
---

# Onboarding Research Guide

This skill guides your thinking when researching a target account that has little or no prior intelligence. It provides the *framework* for good research — you decide the specific approach.

## Starting Context

Before you begin, you should have:
- **Organisation.md** — Your seller's ICP (injected or loaded via `db_get_org`)
- **Honcho memory** — What you learned in prior runs (injected or loaded via `honcho_recall`)
- **Stage context** — NEW PROSPECT, ACTIVE, or REFRESH (injected automatically)

If any are missing from your system prompt, load them with the corresponding tools.

## Planning Your Research

Think about what you need to learn about this account:

1. **Company Intelligence** — What does this company do? How big are they? What's their trajectory? Are they growing? Funded? Expanding?
2. **Key People** — Who are the decision-makers? C-Suite, VP/Director level? Who has public presence?
3. **ICP Fit** — How well does this company match the seller's ICP? Score based on industry, stage, growth, geography, tech stack, and decision-maker accessibility.
4. **Trigger Events** — Is there a reason to engage NOW? Recent funding, leadership changes, expansion, product launches?

Choose the right tools for each question:
- Broad company research → `exa_company_deep_dive` (8 angles in parallel)
- Finding people → `exa_people_search` (LinkedIn discovery)
- Deep research on a person → `exa_person_deep_dive` (6 angles)
- Specific factual question → `exa_answer` (cited Q&A)
- Complex research requiring synthesis → `exa_agentic_research`
- Check existing CRM data first → `hubspot_lookup`

## Setting Up

Create a run record with `db_create_run` — you'll need the runId for all subsequent writes. Do this early.

## Research Strategy

### First-Run (NEW PROSPECT)
You need comprehensive intelligence. The most efficient approach:
- Run `exa_company_deep_dive` for 8-angle company research AND `exa_people_search` for contact discovery — these can run in parallel
- Review the results, identify the strongest signals and most relevant contacts
- Use `exa_answer` for follow-up questions if you need more detail on specific findings

### Refresh Run
You already have a base. Focus on what's new:
- Use `exa_company_deep_dive` to find recent developments
- Compare against your Honcho memory to identify what changed
- Update stale signals and contacts, add new ones

### Targeted Deep Dive
If you need to understand a specific angle:
- `exa_answer` for quick factual questions
- `exa_person_deep_dive` for deep research on a specific stakeholder
- `exa_agentic_research` for complex multi-source synthesis

## Persisting Your Findings

Research is only valuable if it's persisted. After your research phase:

### Signals (`db_write_signals`)
Group your findings into distinct, actionable signals. Each signal needs:
- **type**: funding_round, expansion, product_launch, leadership_change, regulatory, partnership, competitive, hiring
- **title**: Specific headline ("Grab raises $500M Series F")
- **quotes**: Direct excerpts from sources (exact words, not paraphrased)
- **icpRelevance**: Written from the SELLER's POV — cite the specific seller capability this opens a door for, why the target is receptive NOW, and the conversation angle. NOT generic "relevant to ICP."
- **sources**: URLs with titles and publishedDate
- **impact**: 1-10 score

Aim for 3-8 high-quality signals. Quality > quantity.

### Contacts (`db_write_contacts`)
Persist the most relevant people you found. Each contact needs:
- **name**: Full name
- **title**: Current title
- **seniority**: C-Suite / VP / Director / Head / Senior / Manager / unknown
- **linkedinUrl**: If available
- **relevanceNote**: Written like a founder briefing a rep — what this person publicly cares about (recent quotes/activity), their background context, why they'd take a call from the seller, and the best approach angle with a suggested opening line. NOT generic "leads X function."

Aim for 3-8 contacts. Prioritise decision-makers and influencers.

### Tasks (`db_write_tasks`)
Convert your strongest findings into recommended actions. **Tasks are read by salespeople** — they must be able to execute immediately.

Each task needs:
- **type**: send_email, linkedin_dm, schedule_call, research_deeper
- **description**: Written like a founder WhatsApp to a sales rep. MUST include:
  - WHO — person's name, title, what they're dealing with right now
  - WHAT to say — specific talking points and a suggested opening line usable verbatim
  - HOW to approach — channel and angle that resonates with this specific person
- **rationale**: Evidence brief with: (1) direct quotes from sources proving timing window; (2) why this person specifically; (3) why the seller specifically — name the exact capability; (4) signal UUIDs
- **signalIds**: UUIDs of the signals that triggered this recommendation
- **priority**: 1-20 (this week), 21-40 (this month), 41-60 (this quarter), 61-100 (monitor)

Aim for 2-4 well-reasoned tasks. **A salesperson reading the description should be able to execute immediately without any further research.**

### Cross-References (`db_update_signal`)
After persisting contacts and signals, link them where appropriate — e.g., a funding signal to the CEO who announced it. This creates a rich graph of intelligence.

## Scoring the Account

After research, evaluate the account's ICP fit (0-100) using the scoring framework in your instructions. Use `db_update_org` to persist:
- **opportunityScore**: Your calculated score
- **status**: "active" if score >= 40
- **refreshIntervalDays**: Based on score

## Finalising

1. **`db_write_research_log`** — Write a consolidated research summary with:
   - Executive summary (2-3 sentences)
   - Key findings
   - Contact highlights
   - Recommended actions
   - ICP fit score and confidence

2. **`honcho_remember`** — Store what you learned for future runs:
   - Company overview and ICP assessment
   - Key contacts and their roles
   - Top signals and implications
   - What worked and what didn't
   - Recommended next actions

## Efficiency

- Call independent tools in parallel (e.g., company deep dive + people search)
- Batch your writes (one `db_write_signals` with 5 signals, not 5 separate calls)
- Use the compact `toModelOutput` summaries — you don't need full raw data to persist findings
- Plan your tool calls upfront to minimise round-trips
- A complete research run should take 10-15 tool calls, not 30+
