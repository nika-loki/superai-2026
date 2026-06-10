/**
 * DB Push — Pushes Drizzle schema to Aurora RDS via Data API
 * Usage: pnpm tsx scripts/db-push.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
import { execSync } from "child_process";

config({ path: resolve(process.cwd(), ".env.local") });

console.log("[db-push] Using AWS Data API driver");
console.log("[db-push] Database:", process.env.DB_NAME);
console.log("[db-push] Resource ARN:", process.env.DB_RESOURCE_ARN);
console.log("[db-push] Secret ARN:", process.env.DB_SECRET_ARN?.slice(0, 60) + "...");
console.log("[db-push] Region:", process.env.AWS_REGION);

try {
  execSync("npx drizzle-kit push --force", {
    stdio: "inherit",
    env: { ...process.env },
    cwd: process.cwd(),
  });
  console.log("[db-push] ✅ Schema pushed successfully");
} catch {
  console.error("[db-push] ❌ Schema push failed");
  process.exit(1);
}
