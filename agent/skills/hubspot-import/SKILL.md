---
description: "Guides the agent on looking up CRM data from HubSpot during research. The bulk import is an async workflow triggered from the UI — the agent only does ad-hoc lookups."
---

# HubSpot CRM Integration

## Trigger
- Agent is about to research a new organization
- User asks "what do we know about this account in our CRM?"

## Import vs Lookup

**Bulk import is an async background job** — triggered by the user from `/settings/integrations`. The import runs companies → contacts → deals and upserts into RevenueOS tables. The agent does NOT trigger imports.

**Ad-hoc lookup is an agent tool** — `hubspot_lookup` searches HubSpot in real-time by domain, email, or company name to find CRM data that may not yet be synced.

## Instructions

### For ad-hoc lookups during research:
1. Before deep-diving into a new organization, call `hubspot_lookup` with the company domain
2. If CRM data exists, incorporate it into your research context:
   - Note any existing contacts the sales team has identified
   - Check deal stage and value to understand pipeline status
   - Use existing contact info to enrich your recommendations
3. If no CRM data found, proceed with normal Exa-based research
4. Always attribute: "According to your CRM..." vs "Based on web research..."

### If user asks to import/sync:
- Direct them to `/settings/integrations` to trigger the background import
- The import status can be checked via the integrations page
- Do NOT attempt to trigger import yourself

### Stage mapping reference:
- HubSpot appointmentscheduled → discovery
- HubSpot qualifiedtobuy → qualified
- HubSpot presentationscheduled → proposal
- HubSpot closedwon → closed_won
- HubSpot closedlost → closed_lost

## Important notes
- HubSpot data supplements but does not replace Exa research
- If HubSpot data contradicts Exa findings, present both and note the discrepancy
- Import is idempotent — re-importing updates existing records by hubspotId
- Import runs asynchronously — status tracked on workspace.hubspotIntegration.importStatus
