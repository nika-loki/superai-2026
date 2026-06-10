import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/agent/lib/db/index";
import { workspaces, organisations, contacts, deals } from "@/agent/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  createHubspotClient,
  fetchAllCompanies,
  fetchAllContacts,
  fetchAllDeals,
  getDealAssociations,
  mapDealStage,
  type ImportSummary,
} from "@/agent/lib/hubspot.js";

const DEFAULT_OBJECT_TYPES = ["companies", "contacts", "deals"] as const;

const importSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  objectTypes: z.array(z.enum(["companies", "contacts", "deals"])).optional(),
});

/**
 * POST /api/hubspot/import
 *
 * Trigger an async HubSpot CRM import for a workspace.
 * Returns 202 immediately — the client polls GET /api/hubspot/status for progress.
 *
 * Import runs in background: companies → contacts → deals.
 * Status is tracked on workspaces.hubspotIntegration.importStatus.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const parsed = importSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return NextResponse.json(
        { error: "Validation failed", details: errors },
        { status: 400 },
      );
    }

    const { workspaceId } = parsed.data;
    const objectTypes = parsed.data.objectTypes ?? [...DEFAULT_OBJECT_TYPES];
    const envMode = !!process.env["HUBSPOT_API_KEY"];

    // In env-var mode, workspaceId is optional — use first workspace
    let resolvedWorkspaceId = workspaceId;
    if (!resolvedWorkspaceId) {
      if (!envMode) {
        return NextResponse.json(
          { error: "workspaceId required (no HUBSPOT_API_KEY env var)" },
          { status: 400 },
        );
      }
      const [firstWs] = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .limit(1);
      if (!firstWs) {
        return NextResponse.json({ error: "No workspace found" }, { status: 404 });
      }
      resolvedWorkspaceId = firstWs.id;
    }

    // Verify workspace exists
    const [workspace] = await db
      .select({
        id: workspaces.id,
        hubspotIntegration: workspaces.hubspotIntegration,
      })
      .from(workspaces)
      .where(eq(workspaces.id, resolvedWorkspaceId))
      .limit(1);

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Skip connection check in env-var mode
    if (!workspace.hubspotIntegration && !envMode) {
      return NextResponse.json(
        { error: "HubSpot not connected for this workspace" },
        { status: 400 },
      );
    }

    // Check if already running
    if (workspace.hubspotIntegration?.importStatus === "running") {
      return NextResponse.json(
        { error: "Import already in progress", importStatus: "running" },
        { status: 409 },
      );
    }

    // Snapshot current integration state for the background worker
    const currentIntegration = workspace.hubspotIntegration;
    const wsId = resolvedWorkspaceId;

    // Set import status to running
    await db
      .update(workspaces)
      .set({
        hubspotIntegration: {
          ...currentIntegration,
          portalId: currentIntegration?.portalId ?? process.env["HUBSPOT_PORTAL_ID"] ?? "",
          accessToken: currentIntegration?.accessToken ?? "",
          connectedAt: currentIntegration?.connectedAt ?? new Date().toISOString(),
          importStatus: "running",
          errorMessage: undefined,
        },
      })
      .where(eq(workspaces.id, wsId));

    // ── Fire-and-forget the actual import ─────────────────────────
    const capturedTypes = [...objectTypes] as readonly ("companies" | "contacts" | "deals")[];

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    setImmediate(async () => {
      try {
        await runImport(wsId, capturedTypes);

        // Mark complete
        await db
          .update(workspaces)
          .set({
            hubspotIntegration: {
              ...currentIntegration,
              portalId: currentIntegration?.portalId ?? process.env["HUBSPOT_PORTAL_ID"] ?? "",
              accessToken: currentIntegration?.accessToken ?? "",
              connectedAt: currentIntegration?.connectedAt ?? new Date().toISOString(),
              importStatus: "idle",
              lastImportAt: new Date().toISOString(),
              errorMessage: undefined,
            },
          })
          .where(eq(workspaces.id, wsId));

        console.log(`[hubspot/import] Completed for workspace ${wsId}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Import failed";
        console.error(`[hubspot/import] Error for workspace ${wsId}:`, message);

        await db
          .update(workspaces)
          .set({
            hubspotIntegration: {
              ...currentIntegration,
              portalId: currentIntegration?.portalId ?? process.env["HUBSPOT_PORTAL_ID"] ?? "",
              accessToken: currentIntegration?.accessToken ?? "",
              connectedAt: currentIntegration?.connectedAt ?? new Date().toISOString(),
              importStatus: "error",
              errorMessage: message,
            },
          })
          .where(eq(workspaces.id, wsId));
      }
    });

    // Return 202 immediately — client polls /api/hubspot/status
    return NextResponse.json(
      {
        accepted: true,
        workspaceId: wsId,
        objectTypes: capturedTypes,
        status: "running",
        pollUrl: `/api/hubspot/status?workspaceId=${wsId}`,
      },
      { status: 202 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[hubspot/import] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Background import logic (runs in setImmediate, not in request handler)
// ---------------------------------------------------------------------------

async function runImport(
  workspaceId: string,
  objectTypes: readonly ("companies" | "contacts" | "deals")[],
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    companies: { fetched: 0, upserted: 0 },
    contacts: { fetched: 0, upserted: 0 },
    deals: { fetched: 0, upserted: 0 },
  };

  const client = await createHubspotClient(workspaceId);

  // Build hubspotId → revenueOS ID maps for association resolution
  const hubspotIdToOrgId = new Map<string, string>();
  const hubspotIdToContactId = new Map<string, string>();

  // ── Phase 1: Companies → organisations ─────────────────────────
  if (objectTypes.includes("companies")) {
    const companies = await fetchAllCompanies(client);
    summary.companies.fetched = companies.length;

    for (const company of companies) {
      const props = company.properties;
      const name = props.name ?? props.companyname ?? "Unknown";
      const domain = props.domain ?? "";
      const hqCountry = [props.city, props.country].filter(Boolean).join(", ") || "Unknown";
      const icpDescription = props.description ?? "";

      const standardKeys = new Set([
        "name", "companyname", "domain", "city", "country", "description",
        "hs_object_id", "createdate", "lastmodifieddate",
      ]);
      const properties = Object.entries(props)
        .filter(([k, v]) => !standardKeys.has(k) && typeof v === "string" && v.length > 0)
        .map(([key, value]) => ({ key, value, type: "text" as const }));

      const existing = await db
        .select({ id: organisations.id })
        .from(organisations)
        .where(
          and(
            eq(organisations.workspaceId, workspaceId),
            eq(organisations.hubspotId, company.id),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(organisations)
          .set({ name, domain, hqCountry, icpDescription, properties, updatedAt: new Date() })
          .where(eq(organisations.id, existing[0].id));

        hubspotIdToOrgId.set(company.id, existing[0].id);
      } else {
        const [inserted] = await db
          .insert(organisations)
          .values({
            workspaceId,
            name,
            domain,
            hqCountry,
            icpDescription,
            properties,
            hubspotId: company.id,
          })
          .returning({ id: organisations.id });

        hubspotIdToOrgId.set(company.id, inserted.id);
      }

      summary.companies.upserted++;
    }
  }

  // ── Phase 2: Contacts → contacts ───────────────────────────────
  if (objectTypes.includes("contacts")) {
    const hubspotContacts = await fetchAllContacts(client);
    summary.contacts.fetched = hubspotContacts.length;

    for (const contact of hubspotContacts) {
      const props = contact.properties;
      const firstName = props.firstname ?? "";
      const lastName = props.lastname ?? "";
      const name = [firstName, lastName].filter(Boolean).join(" ") || "Unknown";
      const title = props.jobtitle ?? null;
      const email = props.email ?? null;

      // Resolve company via associations already fetched with the contact
      const companyId = contact.companyIds[0] ?? null;
      const orgId = companyId ? hubspotIdToOrgId.get(companyId) ?? null : null;

      if (!orgId) {
        continue;
      }

      const standardKeys = new Set([
        "firstname", "lastname", "jobtitle", "email",
        "hs_object_id", "createdate", "lastmodifieddate", "hs_email_domain",
      ]);
      const properties = Object.entries(props)
        .filter(([k, v]) => !standardKeys.has(k) && typeof v === "string" && v.length > 0)
        .map(([key, value]) => ({ key, value, type: "text" as const }));

      const existing = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.hubspotId, contact.id))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(contacts)
          .set({ name, title, email, properties })
          .where(eq(contacts.id, existing[0].id));

        hubspotIdToContactId.set(contact.id, existing[0].id);
      } else {
        const [inserted] = await db
          .insert(contacts)
          .values({
            orgId,
            name,
            title,
            email,
            properties,
            hubspotId: contact.id,
            source: "hubspot",
          })
          .returning({ id: contacts.id });

        hubspotIdToContactId.set(contact.id, inserted.id);
      }

      summary.contacts.upserted++;
    }
  }

  // ── Phase 3: Deals → deals ─────────────────────────────────────
  if (objectTypes.includes("deals")) {
    const hubspotDeals = await fetchAllDeals(client);
    summary.deals.fetched = hubspotDeals.length;

    for (const deal of hubspotDeals) {
      const props = deal.properties;
      const title = props.dealname ?? "Untitled Deal";
      const valueUsd = props.amount ? parseInt(props.amount, 10) : null;
      const stage = mapDealStage(props.dealstage ?? "");
      const expectedCloseDate = props.closedate ?? null;

      const standardKeys = new Set([
        "dealname", "amount", "dealstage", "closedate",
        "hs_object_id", "createdate", "lastmodifieddate", "pipeline",
      ]);
      const properties = Object.entries(props)
        .filter(([k, v]) => !standardKeys.has(k) && typeof v === "string" && v.length > 0)
        .map(([key, value]) => ({ key, value, type: "text" as const }));

      // Resolve associations from embedded data first
      let orgId = deal.companyIds[0]
        ? hubspotIdToOrgId.get(deal.companyIds[0]) ?? null
        : null;
      let primaryContactId = deal.contactIds[0]
        ? hubspotIdToContactId.get(deal.contactIds[0]) ?? null
        : null;

      // Fallback: try v4 associations API if embedded data was empty
      if (!orgId && !primaryContactId) {
        const associations = await getDealAssociations(client, deal.id);
        orgId = associations.companyId
          ? hubspotIdToOrgId.get(associations.companyId) ?? null
          : null;
        primaryContactId = associations.contactId
          ? hubspotIdToContactId.get(associations.contactId) ?? null
          : null;
      }

      if (!orgId) {
        continue;
      }

      const existing = await db
        .select({ id: deals.id })
        .from(deals)
        .where(eq(deals.hubspotId, deal.id))
        .limit(1);

      const dealData = {
        orgId,
        title,
        valueUsd,
        stage: stage as "discovery" | "qualified" | "proposal" | "negotiation" | "closed_won" | "closed_lost",
        expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
        primaryContactId,
        properties,
        updatedAt: new Date(),
      };

      if (existing.length > 0) {
        await db
          .update(deals)
          .set(dealData)
          .where(eq(deals.id, existing[0].id));
      } else {
        await db.insert(deals).values({
          ...dealData,
          hubspotId: deal.id,
        });
      }

      summary.deals.upserted++;
    }
  }

  console.log(
    `[hubspot/import] Summary: ${summary.companies.upserted} companies, ` +
    `${summary.contacts.upserted} contacts, ${summary.deals.upserted} deals`,
  );

  return summary;
}
