import { db } from "@/agent/lib/db/index";
import { organisations } from "@/agent/lib/db/schema";
import { or, ilike, sql } from "drizzle-orm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();

  if (!q || q.length < 1) {
    return Response.json([]);
  }

  // Use ILIKE for case-insensitive search on name or domain
  const pattern = `%${q}%`;

  const results = await db
    .select({
      id: organisations.id,
      name: organisations.name,
      domain: organisations.domain,
      hqCountry: organisations.hqCountry,
      opportunityScore: organisations.opportunityScore,
      status: organisations.status,
    })
    .from(organisations)
    .where(
      or(
        ilike(organisations.name, pattern),
        ilike(organisations.domain, pattern),
      ),
    )
    .orderBy(sql`COALESCE(${organisations.opportunityScore}, 0) DESC`)
    .limit(20);

  return Response.json(results);
}
