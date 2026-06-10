/**
 * RevenueOS — Database Client (IAM Auth + pg)
 *
 * Supports two environments:
 *   - **Local dev**: Uses @aws-sdk/rds-signer with default AWS credentials
 *   - **Vercel production**: Uses @vercel/oidc-aws-credentials-provider for OIDC-based IAM auth
 *
 * IAM tokens auto-refresh — the pool's `password` function generates a fresh
 * RDS auth token for every new connection. Tokens are cached for 5 min (valid 15 min).
 *
 * Connection resilience:
 *   - `idleTimeoutMillis` forces periodic reconnection with fresh tokens
 *   - `connectionTimeoutMillis` prevents hanging on dead connections
 *   - Failed connections are automatically evicted from the pool
 *   - `dbHealthCheck()` utility for explicit health probing
 *
 * Env vars:
 *   DB_HOST, DB_PORT, DB_NAME, DB_USER — common
 *   DB_USE_PASSWORD + DB_PASSWORD      — bypass IAM, use direct password
 *   AWS_ROLE_ARN                        — Vercel OIDC role ARN
 *   AWS_REGION                          — AWS region (default: us-west-2)
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Signer } from "@aws-sdk/rds-signer";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import * as schema from "./schema.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DB_HOST = process.env.DB_HOST ?? "revenue-os.cluster-c16mg8kgkpip.us-west-2.rds.amazonaws.com";
const DB_PORT = Number(process.env.DB_PORT ?? 5432);
const DB_NAME = process.env.DB_NAME ?? "postgres";
const DB_USER = process.env.DB_USER ?? "postgres";
const DB_REGION = process.env.AWS_REGION ?? "us-west-2";
const AWS_ROLE_ARN = process.env.AWS_ROLE_ARN;
const IS_VERCEL = !!process.env.VERCEL;

// ---------------------------------------------------------------------------
// SSL
// ---------------------------------------------------------------------------

function getSSLOptions() {
  try {
    // Try CWD first (works for dev), then __dirname (works for bundled)
    const certPath = resolve(process.cwd(), "global-bundle.pem");
    const ca = readFileSync(certPath, "utf-8");
    return { rejectUnauthorized: false, ca };
  } catch {
    return { rejectUnauthorized: false };
  }
}

// ---------------------------------------------------------------------------
// IAM Token Provider
// ---------------------------------------------------------------------------

/**
 * Creates a password function that returns a fresh RDS IAM auth token.
 * Tokens are cached for TOKEN_TTL_MS (5 min) — they're valid for 15 min.
 * Every new pg connection calls this function, so connections always get
 * a fresh-enough token.
 */
async function createPasswordProvider(): Promise<() => Promise<string>> {
  // Direct password mode — no IAM, no caching
  if (process.env.DB_USE_PASSWORD === "true") {
    const directPassword = process.env.DB_PASSWORD ?? process.env.AWS_RDS_PASSWORD;
    if (directPassword) {
      console.log("[db] Using direct password auth (DB_USE_PASSWORD=true)");
      return () => Promise.resolve(directPassword);
    }
  }

  // IAM auth with token caching
  let cachedToken: string | null = null;
  let tokenExpiresAt = 0;
  const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 min cache (tokens valid 15 min)

  let signer: Signer;

  if (IS_VERCEL) {
    const { awsCredentialsProvider } = await import("@vercel/oidc-aws-credentials-provider");
    const credentials = awsCredentialsProvider({
      roleArn: AWS_ROLE_ARN!,
      clientConfig: { region: DB_REGION },
    });

    signer = new Signer({
      hostname: DB_HOST,
      port: DB_PORT,
      username: DB_USER,
      region: DB_REGION,
      credentials,
    });
  } else if (AWS_ROLE_ARN) {
    // Local dev with explicit role ARN — assume the role first
    const sts = new STSClient({ region: DB_REGION });
    const { Credentials } = await sts.send(
      new AssumeRoleCommand({
        RoleArn: AWS_ROLE_ARN,
        RoleSessionName: "revenueos-local-dev",
        DurationSeconds: 900,
      }),
    );

    if (!Credentials) {
      throw new Error("[db] Failed to assume role — no credentials returned");
    }

    console.log(`[db] Assumed role ${AWS_ROLE_ARN} for local IAM auth`);
    signer = new Signer({
      hostname: DB_HOST,
      port: DB_PORT,
      username: DB_USER,
      region: DB_REGION,
      credentials: {
        accessKeyId: Credentials.AccessKeyId!,
        secretAccessKey: Credentials.SecretAccessKey!,
        sessionToken: Credentials.SessionToken!,
      },
    });
  } else {
    // Default: use ambient AWS credentials (instance profile, env vars, etc.)
    signer = new Signer({
      hostname: DB_HOST,
      port: DB_PORT,
      username: DB_USER,
      region: DB_REGION,
    });
  }

  return async () => {
    const now = Date.now();
    if (cachedToken && now < tokenExpiresAt) {
      return cachedToken;
    }

    try {
      cachedToken = await signer.getAuthToken();
      tokenExpiresAt = now + TOKEN_TTL_MS;
      return cachedToken;
    } catch (err) {
      // Token generation failed — clear cache and rethrow
      cachedToken = null;
      tokenExpiresAt = 0;
      throw new Error(
        `[db] IAM token generation failed: ${err instanceof Error ? err.message : String(err)}. ` +
        `AWS credentials may have expired. Re-authenticate and restart.`,
      );
    }
  };
}

// ---------------------------------------------------------------------------
// Connection Pool
// ---------------------------------------------------------------------------

const passwordFn = await createPasswordProvider();

const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
  user: DB_USER,
  password: passwordFn,
  ssl: getSSLOptions(),
  max: IS_VERCEL ? 5 : 10,
  // Force connection recycling to pick up fresh IAM tokens
  idleTimeoutMillis: IS_VERCEL ? 10_000 : 30_000,
  connectionTimeoutMillis: 15_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err.message);
});

pool.on("connect", () => {
  console.log(`[db] Connected to ${DB_HOST} (${IS_VERCEL ? "Vercel OIDC" : "local IAM"})`);
});

// Log when connections are removed from the pool (token expiry cleanup)
pool.on("remove", () => {
  // Silently track — connections are recycled as part of normal IAM token rotation
});

// ---------------------------------------------------------------------------
// Drizzle + Exports
// ---------------------------------------------------------------------------

export const db = drizzle(pool, { schema });

/**
 * Quick DB health check — runs a trivial query to verify connectivity.
 * Returns true if the DB is reachable, false otherwise.
 * Useful for startup probes, batch eval pre-checks, and monitoring.
 */
export async function dbHealthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await pool.query("SELECT 1");
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get pool stats for monitoring.
 */
export function dbPoolStats(): { total: number; idle: number; waiting: number } {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}
