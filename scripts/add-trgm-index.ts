/**
 * Add trigram index for ILIKE search performance.
 * Run: npx tsx scripts/add-trgm-index.ts
 */

import { db } from "../agent/lib/db/index.js";
import { sql } from "drizzle-orm";

async function createTrgmIndex() {
  // Enable pg_trgm extension (needed for gin_trgm_ops)
  console.log("Enabling pg_trgm extension...");
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

  // Create trigram index on organisation name for ILIKE search
  console.log("Creating trigram index on organisations.name...");
  const start = Date.now();
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS orgs_name_trgm_idx
    ON organisations USING gin (name gin_trgm_ops)
  `);
  console.log(`  ✓ Done in ${Date.now() - start}ms`);

  // Verify
  const result = await db.execute(sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'organisations' AND indexname LIKE '%trgm%'
  `);
  for (const row of result.rows) {
    console.log(`  ${(row as { indexname: string }).indexname}`);
  }

  console.log("Trigram index created!");
  process.exit(0);
}

createTrgmIndex().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
