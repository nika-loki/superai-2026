/**
 * Add trace_data and chain_of_thought columns to agent_runs.
 * Uses the app's IAM-authenticated DB client.
 */
import { config } from "dotenv";
import { resolve } from "path";
import { sql } from "drizzle-orm";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const { db } = await import("../agent/lib/db/index.js");

  console.log("[migration] Adding trace_data column...");
  await db.execute(sql`ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS trace_data jsonb DEFAULT '[]'::jsonb`);

  console.log("[migration] Adding chain_of_thought column...");
  await db.execute(sql`ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS chain_of_thought text`);

  console.log("[migration] ✅ Schema migration complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error("[migration] ❌ Failed:", err);
  process.exit(1);
});
