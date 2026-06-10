/**
 * One-time migration: ensure DB column names are snake_case.
 * Run: npx tsx scripts/fix-columns.ts
 */
import { db } from "../agent/lib/db/index.js";

async function main() {
  // Check current column names
  const { rows } = await db.execute(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'organisations'
    ORDER BY ordinal_position
  `);
  const cols = rows.map((r: any) => r.column_name);
  console.log("Current organisations columns:", cols.join(", "));

  // Rename camelCase columns to snake_case if they exist
  const renames: Record<string, string> = {
    lastResearchedAt: "last_researched_at",
    nextRunAt: "next_run_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
  };

  for (const [oldName, newName] of Object.entries(renames)) {
    if (cols.includes(oldName)) {
      console.log(`  Renaming "${oldName}" -> "${newName}"`);
      await db.execute(`ALTER TABLE organisations RENAME COLUMN "${oldName}" TO "${newName}"`);
    } else if (cols.includes(newName)) {
      console.log(`  ✓ "${newName}" already exists`);
    } else {
      console.log(`  ✗ Neither "${oldName}" nor "${newName}" found — adding "${newName}"`);
      if (newName.includes("at")) {
        await db.execute(`ALTER TABLE organisations ADD COLUMN "${newName}" TIMESTAMPTZ`);
      }
    }
  }

  // Also fix other tables
  const tableFixes: Record<string, Record<string, string>> = {
    workspaces: { createdAt: "created_at" },
    agent_runs: { startedAt: "started_at", completedAt: "completed_at", createdAt: "created_at" },
    contacts: { discoveredAt: "discovered_at" },
    signals: { createdAt: "created_at" },
    tasks: { executedAt: "executed_at", createdAt: "created_at", updatedAt: "updated_at" },
    deals: { createdAt: "created_at", updatedAt: "updated_at" },
    relationships: { createdAt: "created_at" },
  };

  for (const [table, renames] of Object.entries(tableFixes)) {
    // Check if table exists
    const { rows: tableCheck } = await db.execute(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '${table}')`
    );
    if (!tableCheck[0].exists) {
      console.log(`  Skipping ${table} (doesn't exist)`);
      continue;
    }

    const { rows: colRows } = await db.execute(
      `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}'`
    );
    const tableCols = colRows.map((r: any) => r.column_name);

    for (const [oldName, newName] of Object.entries(renames)) {
      if (tableCols.includes(oldName)) {
        console.log(`  ${table}: Renaming "${oldName}" -> "${newName}"`);
        await db.execute(`ALTER TABLE ${table} RENAME COLUMN "${oldName}" TO "${newName}"`);
      } else if (tableCols.includes(newName)) {
        console.log(`  ${table}: ✓ "${newName}" already exists`);
      }
    }
  }

  // Verify
  const { rows: finalCols } = await db.execute(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'organisations'
    ORDER BY ordinal_position
  `);
  console.log("\nFinal organisations columns:", finalCols.map((r: any) => r.column_name).join(", "));

  console.log("\nDone!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
