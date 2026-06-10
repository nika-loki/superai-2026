import { defineConfig } from "drizzle-kit";
import { readFileSync } from "fs";
import { resolve } from "path";

function getSSLOptions() {
  try {
    const certPath = resolve(process.cwd(), "global-bundle.pem");
    const ca = readFileSync(certPath, "utf-8");
    return { rejectUnauthorized: false, ca };
  } catch {
    return { rejectUnauthorized: false };
  }
}

export default defineConfig({
  schema: "./agent/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    host: process.env.DB_HOST ?? "revenue-os.cluster-c16mg8kgkpip.us-west-2.rds.amazonaws.com",
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? "postgres",
    user: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASSWORD || process.env.AWS_RDS_PASSWORD || "",
    ssl: getSSLOptions(),
  },
});
