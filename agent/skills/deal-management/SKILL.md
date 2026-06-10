---
description: "Deal management guide for active pipeline accounts. Buying committee mapping, next-best-action recommendations, competitive positioning, and engagement timing."
---

# Deal Management Guide

Use this skill when the account is in an active sales cycle — there are existing contacts, signals, and tasks that indicate a live deal.

## Assessing the Deal

Before recommending actions, understand the current state:

1. **Review existing intelligence** — Check Honcho memory, signals, and contacts already in the DB
2. **Identify the buying committee** — Map out who's involved in the decision
3. **Understand the stage** — Early discovery? Evaluation? Negotiation? At risk?
4. **Check for recent changes** — New signals since last run (funding, leadership, strategy shifts)

Use `hubspot_lookup` to check if CRM data exists with deal stage and notes. Use `db_get_org` for the current score and status.

## Buying Committee Mapping

Think about the deal from the customer's perspective:

- **Economic Buyer** — Who controls the budget? (CFO, VP Finance, CEO)
- **Technical Buyer** — Who evaluates the solution? (CTO, VP Engineering, Head of Architecture)
- **User Buyer** — Who will actually use it? (Developers, data scientists, product managers)
- **Champion** — Who is advocating for us internally?
- **Sponsor** — Who has the authority to make it happen?

Use `exa_person_deep_dive` on key committee members to find talking points — recent speeches, blog posts, conference appearances, interests.

## Next-Best-Action Framework

Based on the deal stage and committee mapping:

**Early Discovery:**
- Research the company's strategic priorities and pain points
- Identify the right first contact and outreach angle
- Prepare personalised talking points based on their public presence

**Evaluation:**
- Understand their evaluation criteria (technical, business, compliance)
- Research competitors they might also be evaluating
- Find case studies or references in similar APAC companies

**Negotiation:**
- Research the decision-maker's priorities and communication style
- Identify potential objections based on their public statements
- Find timing signals (budget cycles, fiscal year end)

**At Risk:**
- Look for changes that might indicate deal stagnation (leadership changes, budget cuts)
- Find new angles or champions within the organisation
- Research competitor moves that might be affecting the deal

## Engagement Timing Signals

Watch for these signals that suggest optimal outreach timing:

- **Budget signals**: Funding rounds, fiscal year planning, budget allocation announcements
- **Pain signals**: Public complaints about current solutions, job postings for related roles
- **Change signals**: New leadership, reorganisations, strategy pivots
- **External signals**: Regulatory changes, competitive pressure, market shifts

## Persisting Deal Intelligence

Update the account with your findings:
- **`db_write_signals`** — New signals that affect the deal
- **`db_write_contacts`** — New contacts discovered in the buying committee
- **`db_write_tasks`** — Specific next-best-actions with rationale and timing
- **`db_update_org`** — Updated score and status based on deal progression
- **`honcho_remember`** — Deal context, committee dynamics, competitive intelligence

## Task Recommendations

Good deal management tasks are:
- **Specific** — "Email VP Engineering about their recent talk at AWS Summit on microservices migration"
- **Time-sensitive** — "Reach out this week before their board meeting on Thursday"
- **Evidence-backed** — Cite the signal or contact that triggered this recommendation
- **Multi-threaded** — Engage multiple committee members, not just one point of contact
