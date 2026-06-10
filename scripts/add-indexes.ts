/**
 * One-time script to add performance indexes.
 * Uses the app's IAM-authed DB client.
 *
 * Run: npx tsx scripts/add-indexes.ts
 */

import { db } from "../agent/lib/db/index.js";
import { sql } from "drizzle-orm";

async function createIndexes() {
  // First, discover actual column names
  const cols = await db.execute(
    sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('signals', 'tasks') ORDER BY table_name, ordinal_position`,
  );
  console.log("Discovered columns:");
  for (const row of cols.rows) {
    console.log(`  ${(row as { table_name: string; column_name: string }).table_name}.${(row as { table_name: string; column_name: string }).column_name}`);
  }

  const indexes = [
    {
      name: "signals_org_created_idx",
      ddl: 'CREATE INDEX IF NOT EXISTS signals_org_created_idx ON signals (org_id, "createdAt")',
    },
    {
      name: "tasks_org_priority_idx",
      ddl: 'CREATE INDEX IF NOT EXISTS tasks_org_priority_idx ON tasks (org_id, "priority")',
    },
  ];

  for (const idx of indexes) {
    console.log(`\nCreating index: ${idx.name}...`);
    const start = Date.now();
    await db.execute(sql.raw(idx.ddl));
    console.log(`  ✓ Done in ${Date.now() - start}ms`);
  }

  // Verify indexes exist
  const result = await db.execute(sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename IN ('signals', 'tasks')
    ORDER BY indexname
  `);
  console.log("\nCurrent indexes on signals & tasks:");
  for (const row of result.rows) {
    console.log(`  ${(row as { indexname: string }).indexname}`);
  }

  console.log("\nAll indexes created!");
  process.exit(0);
}

createIndexes().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
