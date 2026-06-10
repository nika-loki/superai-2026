# HubSpot CRM Import — Design Document

**Date:** 2026-06-09
**Status:** Approved
**Scope:** Import organisations, contacts, deals, and associations FROM HubSpot INTO RevenueOS

## Overview

RevenueOS currently sources all data via Exa search. This design adds HubSpot as a **data source**, allowing users to import their existing CRM data (companies, contacts, deals) into RevenueOS so the agent can enrich and research accounts that already exist in the sales team's pipeline.

### Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Direction | HubSpot → RevenueOS (import only) | Simplest useful direction for hackathon |
| Auth | Per-workspace encrypted credentials | Users enter their own private app access token |
| Encryption | AES-256 in DB with ENCRYPTION_KEY env var | Sufficient for demo; migrate to AWS Secrets Manager in production |
| Mechanism | Bulk import skill + agent tools | Bulk for initial seeding, tools for ad-hoc lookup during research |
| Deal mapping | New deals table (already in schema) | Full fidelity with stage enum mapping |
| HubSpot IDs | Add `hubspotId` column to 3 tables | Enables dedup, source linking, future sync |

## Architecture

### Data Flow

```
User connects HubSpot on /settings/integrations
  → POST /api/hubspot/connect { portalId, accessToken }
  → AES-256 encrypt token → save to workspaces.hubspotIntegration

User or agent triggers import
  → POST /api/hubspot/import OR hubspot_import tool

  Step 1: Fetch HubSpot companies (batch, paginated, 100/batch)
    → Upsert into organisations by hubspotId
    → Set source, hubspotId, map properties

  Step 2: Fetch HubSpot contacts (batch, with company associations)
    → Upsert into contacts by hubspotId
    → Resolve company association → set orgId FK

  Step 3: Fetch HubSpot deals (batch, with associations)
    → Insert into deals with mapDealStage()
    → Resolve company → orgId, contact → primaryContactId

  Step 4: Return summary + update workspace.lastImportAt
```

### HubSpot API Endpoints Used

| Endpoint | Purpose |
|---|---|
| `GET /crm/v3/objects/companies` | List all companies (paginated) |
| `GET /crm/v3/objects/contacts` | List all contacts (paginated) |
| `GET /crm/v3/objects/deals` | List all deals (paginated) |
| `POST /crm/v3/objects/{type}/search` | Search by domain/email for lookup tool |
| `GET /crm/v4/objects/{type}/{id}/associations/{type}` | Get associations |

### SDK: `@hubspot/api-client`

```typescript
const client = new Client({ accessToken: token, numberOfApiCallRetries: 3 });
client.crm.companies.basicApi.getPage(...)
client.crm.companies.searchApi.doSearch(...)
client.crm.contacts.basicApi.getPage(...)
client.crm.deals.basicApi.getPage(...)
client.crm.associations.v4.basicApi.getPage(...)
```

## Schema Changes

### New columns on existing tables

**workspaces** — add:
```typescript
hubspotIntegration: jsonb("hubspot_integration").$type<{
  portalId: string;
  accessToken: string;       // AES-256 encrypted
  connectedAt: string;
  lastImportAt?: string;
  importStatus?: "idle" | "running" | "error";
  errorMessage?: string;
}>(),
```

**organisations** — add:
```typescript
hubspotId: text("hubspot_id").unique(),
```

**contacts** — add:
```typescript
hubspotId: text("hubspot_id").unique(),
```

**deals** — add:
```typescript
hubspotId: text("hubspot_id").unique(),
```

### Deal stage mapping

```typescript
const stageMap: Record<string, string> = {
  appointmentscheduled: "discovery",
  qualifiedtobuy: "qualified",
  presentationscheduled: "proposal",
  negotiaton: "negotiation",
  closedwon: "closed_won",
  closedlost: "closed_lost",
};
```

### HubSpot property mapping

| HubSpot Company | RevenueOS organisations |
|---|---|
| `name` | `name` |
| `domain` | `domain` |
| `city` / `country` | `hqCountry` |
| `description` | `icpDescription` |
| custom properties | `properties` JSONB |

| HubSpot Contact | RevenueOS contacts |
|---|---|
| `firstname` + `lastname` | `name` |
| `jobtitle` | `title` |
| `email` | `email` |
| custom properties | `properties` JSONB |

| HubSpot Deal | RevenueOS deals |
|---|---|
| `dealname` | `title` |
| `amount` | `valueUsd` |
| `dealstage` | `stage` (via mapDealStage) |
| `closedate` | `expectedCloseDate` |
| custom properties | `properties` JSONB |

## File Manifest

### Create (10 files)

| File | Purpose |
|---|---|
| `agent/lib/crypto.ts` | AES-256 encrypt/decrypt helpers |
| `agent/lib/hubspot.ts` | Per-workspace client factory + fetchAllCompanies/Contacts/Deals + mapDealStage |
| `agent/tools/hubspot-import.ts` | Bulk import tool (companies → contacts → deals) |
| `agent/tools/hubspot-lookup.ts` | Ad-hoc search by domain/email |
| `agent/skills/hubspot-import/SKILL.md` | Skill guiding agent on import flow |
| `app/api/hubspot/connect/route.ts` | Save encrypted credentials |
| `app/api/hubspot/import/route.ts` | Trigger import from UI |
| `app/api/hubspot/status/route.ts` | Check connection status |
| `app/settings/integrations/page.tsx` | UI: connect HubSpot + trigger import |
| `agent/instructions/hubspot-context.ts` | Dynamic instruction: inject HubSpot connection status |

### Modify (5 files)

| File | Change |
|---|---|
| `agent/db/schema.ts` | Add hubspotId to 3 tables, hubspotIntegration to workspaces |
| `agent/instructions.md` | Add HubSpot tools to reference table + research instructions |
| `agent/agent.ts` | Register hubspot-import + hubspot-lookup tools |
| `package.json` | Add `@hubspot/api-client` |
| `.env.example` | Add `ENCRYPTION_KEY` |

## Rate Limits & Performance

- HubSpot Enterprise: 190 req/10sec, 1M daily
- Batch APIs: 100 records/call
- Import of 1000 companies + 2000 contacts + 500 deals ≈ 36 batch calls ≈ 10 seconds
- Search API: ~5 req/sec, 200 results/page

## Security

- Access tokens encrypted with AES-256-GCM before DB storage
- `ENCRYPTION_KEY` stored as server-side env var (never committed)
- HubSpot credentials scoped to workspace (multi-tenant isolation)
- Private app token scopes limited to: `crm.objects.contacts.read`, `crm.objects.companies.read`, `crm.objects.deals.read`

## Future Work (post-hackathon)

- Bidirectional sync (push RevenueOS findings back to HubSpot)
- OAuth flow for marketplace distribution
- Webhook handlers for real-time CRM updates
- AWS Secrets Manager migration
- Dynamic pipeline stage fetching
- Import dedup with fuzzy matching
