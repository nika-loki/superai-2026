import { db } from "../agent/lib/db/index.js";
import { organisations, workspaces } from "../agent/lib/db/schema.js";

async function main() {
  const ws = await db.select().from(workspaces);
  console.log("=== WORKSPACES ===");
  ws.forEach((w) => console.log(w.id, w.name));

  const orgs = await db
    .select({
      id: organisations.id,
      name: organisations.name,
      domain: organisations.domain,
      hqCountry: organisations.hqCountry,
      status: organisations.status,
      opportunityScore: organisations.opportunityScore,
      workspaceId: organisations.workspaceId,
    })
    .from(organisations);

  console.log(`\n=== ORGANISATIONS (${orgs.length}) ===`);
  orgs.forEach((o) =>
    console.log(
      o.id,
      "|",
      o.name,
      "|",
      o.domain,
      "|",
      o.hqCountry,
      "|",
      o.status,
      "| score:",
      o.opportunityScore
    )
  );
  process.exit(0);
}

main().catch(console.error);
