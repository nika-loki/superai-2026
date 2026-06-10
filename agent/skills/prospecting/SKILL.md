---
description: "Prospecting guide for discovering and prioritising contacts at target accounts. Contact prioritisation framework, signal detection checklist, and outreach strategy."
---

# Prospecting Guide

Use this skill when your primary goal is discovering and prioritising contacts at a target account — especially when you need to build out the buying committee.

## Contact Discovery Strategy

Think about WHO matters at this account:

1. **Decision-makers** — Who has budget authority? (CEO, CFO, CTO, VP-level)
2. **Influencers** — Who shapes the decision? (Head of Engineering, Director of Product)
3. **Champions** — Who would benefit most from the seller's product? (Individual contributors feeling the pain)
4. **Blockers** — Who might resist? (Incumbent vendor relationships, internal politics)

Use `exa_people_search` to find people, filtering by:
- **Company name** (required)
- **Titles** (e.g., ["CTO", "VP Engineering", "Head of Product"])
- **Country** (e.g., "Singapore" for APAC-specific search)

For your most promising contacts, use `exa_person_deep_dive` for 6-angle profiling (speeches, podcasts, conferences, LinkedIn, social, news) — this gives you talking points and personalisation angles.

## Contact Prioritisation Framework

Not every contact is equally valuable. Prioritise:

**P0 (Immediate outreach target):**
- C-Suite (CEO, CTO, COO, CFO) with recent public mentions
- VP/Director of Engineering or Product at a company with strong ICP signals
- Any contact mentioned in a funding or expansion announcement

**P1 (High priority):**
- C-Suite without recent mentions
- VP/Director of Sales, Marketing, or Operations
- Head of Engineering/Product with discoverable LinkedIn

**P2 (Monitor):**
- Senior Engineers, Staff Engineers
- Directors without obvious decision authority
- Contacts with stale information (>12 months old)

**P3 (Low priority):**
- Junior roles (Associate, Analyst, Coordinator)
- Contacts with minimal discoverable information
- Former employees (note departure in relevanceNote)

## Signal Detection Checklist

When analysing research results, look for these signal types:

- **Funding round** — Series A/B/C/D, amount, date, lead investor
- **Leadership change** — New C-suite hire, departure, promotion
- **Product launch** — New product, major feature, platform expansion
- **Expansion** — New office, new market, new country
- **Partnership** — Strategic partnership, integration, reseller agreement
- **Regulatory** — License granted, compliance certification, audit
- **Competitive** — Competitor weakness, market consolidation
- **Technology** — Tech stack change, migration, API launch
- **Hiring** — Rapid headcount growth, key role openings
- **Financial** — Revenue milestone, IPO preparation, profitability

## ICP Scoring Guide

Score the account on a 0-100 scale:

| Factor | Points | What to evaluate |
|--------|--------|-----------------|
| Industry fit | 0-20 | Direct match to the seller's target industries |
| Company stage | 0-15 | Series A+ or 50+ employees preferred |
| Growth signals | 0-20 | Hiring, funding, expansion in last 6 months |
| Geography | 0-15 | APAC HQ or significant APAC operations |
| Technology signals | 0-15 | Modern tech stack, API-first, digital transformation |
| Decision-maker accessibility | 0-15 | C-Suite/VP contacts discoverable with titles |

Score → action:
- **80+**: Hot lead — recommend immediate outreach, set refreshIntervalDays to 1-3
- **60-79**: Warm lead — schedule follow-up in 7 days
- **40-59**: Nurture — refresh in 30 days
- **<40**: Low fit — park, check again in 90 days

## Persisting Contacts

When you're ready to persist contacts with `db_write_contacts`, include:
- **name** and **title** (current, accurate)
- **seniority** level (C-Suite, VP, Director, Head, Senior, Manager, unknown)
- **linkedinUrl** (critical for outreach)
- **relevanceNote** (why this person matters for the seller's motion)
- **email** (if discoverable)

Batch all contacts into a single `db_write_contacts` call. The tool deduplicates by (orgId, linkedinUrl).

## Cross-Referencing with Signals

After persisting both contacts and signals, use `db_update_signal` to link them:
- A funding signal → the CEO who announced it
- An expansion signal → the VP of Operations leading it
- A product launch → the CTO who drove it

These connections make the intelligence actionable — the seller knows WHO to contact about WHAT.
