/**
 * RevenueOS — HubSpot API Client Factory
 *
 * Creates per-workspace HubSpot clients using stored encrypted credentials
 * or the HUBSPOT_API_KEY env var (demo fallback).
 * Provides helpers to fetch companies, contacts, and deals with associations.
 */

import { Client } from "@hubspot/api-client";
import { decrypt } from "./crypto";
import { db } from "./db/index";
import { workspaces } from "./db/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A HubSpot company record. */
export interface HubspotCompany {
  id: string;
  properties: Record<string, string | null | undefined>;
}

/** A HubSpot contact record with associated company IDs. */
export interface HubspotContact {
  id: string;
  properties: Record<string, string | null | undefined>;
  companyIds: string[];
}

/** A HubSpot deal record with associated company and contact IDs. */
export interface HubspotDeal {
  id: string;
  properties: Record<string, string | null | undefined>;
  companyIds: string[];
  contactIds: string[];
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

/**
 * Create an authenticated HubSpot client.
 *
 * Resolution order:
 * 1. HUBSPOT_API_KEY env var (demo / single-tenant mode)
 * 2. Encrypted token in workspaces.hubspotIntegration (multi-tenant mode)
 *
 * @param workspaceId — optional workspace UUID for multi-tenant lookup
 * @returns an authenticated HubSpot Client
 * @throws Error if no credentials are available
 */
export async function createHubspotClient(
  workspaceId?: string,
): Promise<Client> {
  // Demo mode: use env var directly
  const envToken = process.env["HUBSPOT_API_KEY"];
  if (envToken) {
    return new Client({ accessToken: envToken, numberOfApiCallRetries: 3 });
  }

  // Multi-tenant mode: decrypt stored credentials
  if (!workspaceId) {
    throw new Error("HubSpot not configured — set HUBSPOT_API_KEY or connect via UI");
  }

  const [row] = await db
    .select({ hubspotIntegration: workspaces.hubspotIntegration })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!row?.hubspotIntegration?.accessToken) {
    throw new Error("HubSpot not connected for this workspace");
  }

  const accessToken = decrypt(row.hubspotIntegration.accessToken);

  return new Client({
    accessToken,
    numberOfApiCallRetries: 3,
  });
}

/**
 * Get the HubSpot portal ID.
 *
 * Resolution order:
 * 1. HUBSPOT_PORTAL_ID env var
 * 2. workspace.hubspotIntegration.portalId
 */
export async function getHubspotPortalId(workspaceId?: string): Promise<string | undefined> {
  const envPortal = process.env["HUBSPOT_PORTAL_ID"];
  if (envPortal) return envPortal;

  if (!workspaceId) return undefined;

  const [row] = await db
    .select({ hubspotIntegration: workspaces.hubspotIntegration })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  return row?.hubspotIntegration?.portalId ?? undefined;
}

// ---------------------------------------------------------------------------
// Deal stage mapping
// ---------------------------------------------------------------------------

/** HubSpot dealstage → RevenueOS dealStageEnum */
const HS_STAGE_MAP: Record<string, string> = {
  appointmentscheduled: "discovery",
  qualifiedtobuy: "qualified",
  presentationscheduled: "proposal",
  closedwon: "closed_won",
  closedlost: "closed_lost",
  negotiationsent: "negotiation",
};

/**
 * Map a HubSpot dealstage pipeline value to our dealStageEnum.
 *
 * @param hsStage — the HubSpot internal dealstage string
 * @returns the corresponding RevenueOS deal stage
 */
export function mapDealStage(hsStage: string): string {
  return HS_STAGE_MAP[hsStage] ?? "discovery";
}

// ---------------------------------------------------------------------------
// Record URL builder
// ---------------------------------------------------------------------------

/**
 * Build a direct link to a HubSpot CRM record.
 *
 * @param portalId  — the HubSpot portal (account) ID
 * @param objectType — e.g. "company", "contact", "deal"
 * @param objectId  — the record's HubSpot ID
 * @returns a URL that opens the record in the HubSpot UI
 */
export function hubspotRecordUrl(
  portalId: string,
  objectType: string,
  objectId: string,
): string {
  return `https://app.hubspot.com/contacts/${portalId}/record/${objectType}/${objectId}`;
}

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

/**
 * Fetch all companies from the connected HubSpot portal.
 *
 * Uses the built-in `getAll` helper which handles pagination automatically.
 * Returns up to 100 records per page behind the scenes.
 *
 * @param client — authenticated HubSpot client
 * @returns array of company records with their properties
 */
export async function fetchAllCompanies(
  client: Client,
): Promise<HubspotCompany[]> {
  const results =
    await client.crm.companies.getAll(
      100,
      undefined,
      ["name", "domain", "city", "country", "description"],
      undefined,
      undefined,
      false,
    );

  const companies: HubspotCompany[] = results.map((record: { id: string; properties: Record<string, string | null> }) => ({
    id: record.id,
    properties: record.properties,
  }));

  console.log(`[hubspot] Fetched ${companies.length} companies`);
  return companies;
}

/**
 * Fetch all contacts from the connected HubSpot portal, including
 * associated company IDs.
 *
 * @param client — authenticated HubSpot client
 * @returns array of contact records with associated company IDs
 */
export async function fetchAllContacts(
  client: Client,
): Promise<HubspotContact[]> {
  const results =
    await client.crm.contacts.getAll(
      100,
      undefined,
      ["firstname", "lastname", "email", "jobtitle", "phone", "company"],
      undefined,
      ["company"],
      false,
    );

  const contacts: HubspotContact[] = results.map((record: { id: string; properties: Record<string, string | null>; associations?: { company?: { results: Array<{ id: string }> } } }) => {
    const companyAssocs = record.associations?.company?.results ?? [];
    const companyIds = companyAssocs.map((a: { id: string }) => a.id);

    return {
      id: record.id,
      properties: record.properties,
      companyIds,
    };
  });

  console.log(
    `[hubspot] Fetched ${contacts.length} contacts (with company associations)`,
  );
  return contacts;
}

/**
 * Fetch all deals from the connected HubSpot portal, including
 * associated company IDs and contact IDs.
 *
 * @param client — authenticated HubSpot client
 * @returns array of deal records with associated company and contact IDs
 */
export async function fetchAllDeals(
  client: Client,
): Promise<HubspotDeal[]> {
  const results =
    await client.crm.deals.getAll(
      100,
      undefined,
      ["dealname", "amount", "dealstage", "closedate", "pipeline", "hubspot_owner_id"],
      undefined,
      ["company", "contact"],
      false,
    );

  const deals: HubspotDeal[] = results.map((record: { id: string; properties: Record<string, string | null>; associations?: { company?: { results: Array<{ id: string }> }; contact?: { results: Array<{ id: string }> } } }) => {
    const companyAssocs = record.associations?.company?.results ?? [];
    const contactAssocs = record.associations?.contact?.results ?? [];

    return {
      id: record.id,
      properties: record.properties,
      companyIds: companyAssocs.map((a: { id: string }) => a.id),
      contactIds: contactAssocs.map((a: { id: string }) => a.id),
    };
  });

  console.log(
    `[hubspot] Fetched ${deals.length} deals (with company + contact associations)`,
  );
  return deals;
}

// ---------------------------------------------------------------------------
// Association helpers (for API route use)
// ---------------------------------------------------------------------------

/** Summary counts returned from the import API route. */
export interface ImportSummary {
  companies: { fetched: number; upserted: number };
  contacts: { fetched: number; upserted: number };
  deals: { fetched: number; upserted: number };
}

/**
 * Resolve the primary company ID associated with a HubSpot contact.
 *
 * @param client — authenticated HubSpot client
 * @param contactId — HubSpot contact ID
 * @returns the associated company ID, or null if none found
 */
export async function getContactCompanyAssociation(
  client: Client,
  contactId: string,
): Promise<string | null> {
  try {
    const response = await client.crm.associations.v4.basicApi.getPage(
      "contacts",
      contactId,
      "companies",
    );
    const results = response.results ?? [];
    return results.length > 0 ? String(results[0]!.toObjectId) : null;
  } catch {
    return null;
  }
}

/**
 * Resolve company and contact associations for a HubSpot deal.
 *
 * @param client — authenticated HubSpot client
 * @param dealId — HubSpot deal ID
 * @returns object with companyId and contactId (first of each), or nulls
 */
export async function getDealAssociations(
  client: Client,
  dealId: string,
): Promise<{ companyId: string | null; contactId: string | null }> {
  let companyId: string | null = null;
  let contactId: string | null = null;

  try {
    const companyAssocs = await client.crm.associations.v4.basicApi.getPage(
      "deals",
      dealId,
      "companies",
    );
    const companyResults = companyAssocs.results ?? [];
    if (companyResults.length > 0) {
      companyId = String(companyResults[0]!.toObjectId);
    }
  } catch {
    // No company association
  }

  try {
    const contactAssocs = await client.crm.associations.v4.basicApi.getPage(
      "deals",
      dealId,
      "contacts",
    );
    const contactResults = contactAssocs.results ?? [];
    if (contactResults.length > 0) {
      contactId = String(contactResults[0]!.toObjectId);
    }
  } catch {
    // No contact association
  }

  return { companyId, contactId };
}
