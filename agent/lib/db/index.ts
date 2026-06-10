/**
 * RevenueOS — Database Client (IAM Auth + pg)
 *
 * Supports two environments:
 *   - **Local dev**: Uses @aws-sdk/rds-signer with default AWS credentials
 *   - **Vercel production**: Uses @vercel/oidc-aws-credentials-provider for OIDC-based IAM auth
 *
 * IAM tokens auto-refresh — the pool's `password` function returns a cached token.
 * A background timer pre-generates tokens every 10 minutes so they're ALWAYS
 * warm when a new connection needs one. No more 1.2s cold starts.
 *
 * Connection resilience:
 *   - Background token refresh every 10 min (tokens valid 15 min)
 *   - Warm-up query on module load pre-generates first token
 *   - Keepalive query every 60s prevents RDS from killing idle connections
 *   - `idleTimeoutMillis` recycles connections before token expiry
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
import { resolve } from "path";
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

// Token lifecycle:
// - RDS IAM tokens are valid for 15 minutes
// - We pre-generate a new one every 10 minutes (well within the 15 min window)
// - Cache TTL is 10 minutes — if the background timer fails, the next
//   connection request will still generate on-demand
const TOKEN_REFRESH_MS = 10 * 60 * 1000; // 10 min refresh interval
const TOKEN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min cache TTL
const SIGNER_REFRESH_MS = 10 * 60 * 1000; // Re-assume role every 10 min

// ---------------------------------------------------------------------------
// SSL
// ---------------------------------------------------------------------------

function getSSLOptions() {
  try {
    const certPath = resolve(process.cwd(), "global-bundle.pem");
    const ca = readFileSync(certPath, "utf-8");
    return { rejectUnauthorized: false, ca };
  } catch {
    return { rejectUnauthorized: false };
  }
}

// ---------------------------------------------------------------------------
// IAM Token Provider with Background Auto-Refresh
// ---------------------------------------------------------------------------

/**
 * Creates a password function backed by a background token refresh loop.
 *
 * The loop runs every TOKEN_REFRESH_MS (10 min) and pre-generates a fresh
 * IAM auth token. When the pg pool needs a password for a new connection,
 * it gets the cached token instantly — no 1.2s cold start.
 */
async function createPasswordProvider(): Promise<() => Promise<string>> {
  // Direct password mode — no IAM, no caching, no background loop
  if (process.env.DB_USE_PASSWORD === "true") {
    const directPassword = process.env.DB_PASSWORD ?? process.env.AWS_RDS_PASSWORD;
    if (directPassword) {
      console.log("[db] Using direct password auth (DB_USE_PASSWORD=true)");
      return () => Promise.resolve(directPassword);
    }
  }

  // ── Shared mutable state ──────────────────────────────────────────────
  let cachedToken: string | null = null;
  let tokenGeneratedAt = 0;

  // Cached signer — recreated when STS credentials expire
  let signer: Signer | null = null;
  let signerExpiresAt = 0;

  // ── Signer factory ────────────────────────────────────────────────────
  async function getSigner(): Promise<Signer> {
    // Vercel OIDC — credentials auto-refresh, create once
    if (IS_VERCEL) {
      if (!signer) {
        const { awsCredentialsProvider } = await import("@vercel/oidc-aws-credentials-provider");
        const credentials = awsCredentialsProvider({
          roleArn: AWS_ROLE_ARN!,
          clientConfig: { region: DB_REGION },
        });
        signer = new Signer({
          hostname: DB_HOST, port: DB_PORT, username: DB_USER, region: DB_REGION, credentials,
        });
      }
      return signer;
    }

    // Local dev with role ARN — re-assume before credentials expire
    if (AWS_ROLE_ARN) {
      const now = Date.now();
      if (signer && now < signerExpiresAt) {
        return signer;
      }
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
        hostname: DB_HOST, port: DB_PORT, username: DB_USER, region: DB_REGION,
        credentials: {
          accessKeyId: Credentials.AccessKeyId!,
          secretAccessKey: Credentials.SecretAccessKey!,
          sessionToken: Credentials.SessionToken!,
        },
      });
      signerExpiresAt = now + SIGNER_REFRESH_MS;
      return signer;
    }

    // Ambient credentials (instance profile, env vars) — create once
    if (!signer) {
      signer = new Signer({
        hostname: DB_HOST, port: DB_PORT, username: DB_USER, region: DB_REGION,
      });
    }
    return signer;
  }

  // ── Token generation (single attempt) ─────────────────────────────────
  async function generateToken(): Promise<{ token: string; durationMs: number }> {
    const start = Date.now();
    const activeSigner = await getSigner();
    const token = await activeSigner.getAuthToken();
    cachedToken = token;
    tokenGeneratedAt = Date.now();
    return { token, durationMs: Date.now() - start };
  }

  // ── Background auto-refresh loop ──────────────────────────────────────
  const refreshTimer = setInterval(async () => {
    try {
      const { durationMs } = await generateToken();
      console.log(`[db] 🔄 Token pre-refreshed in ${durationMs}ms — next refresh in ${TOKEN_REFRESH_MS / 1000}s`);
    } catch (err) {
      console.warn(
        `[db] ⚠️ Background token refresh failed: ${err instanceof Error ? err.message : String(err)}. ` +
        "Will retry on next connection request.",
      );
      // Don't clear caches — the cached token may still be valid.
      // On-demand generation will retry with fresh credentials if needed.
    }
  }, TOKEN_REFRESH_MS);

  // Don't let the timer prevent process exit
  if (refreshTimer.unref) {
    refreshTimer.unref();
  }

  // ── Initial warm-up (fire and forget — don't block module load) ────────
  generateToken()
    .then(({ durationMs }) => {
      console.log(`[db] 🔑 Initial IAM token generated in ${durationMs}ms — auto-refresh every ${TOKEN_REFRESH_MS / 1000}s`);
    })
    .catch((err) => {
      console.warn(`[db] ⚠️ Initial token generation failed: ${err instanceof Error ? err.message : String(err)}`);
    });

  // ── Password function (called by pg Pool for each new connection) ──────
  return async () => {
    // Return cached token if it's fresh enough
    if (cachedToken && Date.now() - tokenGeneratedAt < TOKEN_CACHE_TTL_MS) {
      return cachedToken;
    }

    // Cache miss or expired — generate on demand
    try {
      const { token } = await generateToken();
      return token;
    } catch (err) {
      // Total failure — clear everything for full retry next time
      cachedToken = null;
      tokenGeneratedAt = 0;
      signer = null;
      signerExpiresAt = 0;
      throw new Error(
        `[db] IAM token generation failed: ${err instanceof Error ? err.message : String(err)}. ` +
        `All credential caches cleared — will retry with fresh STS credentials.`,
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
  // Keep connections alive for the full token lifetime
  // Connections will use the pre-cached token when they reconnect
  idleTimeoutMillis: IS_VERCEL ? 30_000 : 5 * 60_000,
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

pool.on("remove", () => {
  // Silently track — connections are recycled as part of normal IAM token rotation
});

// ---------------------------------------------------------------------------
// Drizzle + Exports
// ---------------------------------------------------------------------------

export const db = drizzle(pool, { schema });

// ---------------------------------------------------------------------------
// Warm-up: Pre-populate connection pool before first user request
// ---------------------------------------------------------------------------

(async function warmUp() {
  const start = Date.now();
  try {
    await pool.query("SELECT 1 AS warmup");
    console.log(`[db] ✅ Pool warm-up complete in ${Date.now() - start}ms — connection ready`);
  } catch (err) {
    console.warn(
      `[db] ⚠️ Pool warm-up failed in ${Date.now() - start}ms: ${err instanceof Error ? err.message : String(err)}. ` +
      "First request may be slow while connection establishes.",
    );
  }
})();

// ---------------------------------------------------------------------------
// Keepalive: Prevent RDS from killing idle connections
// ---------------------------------------------------------------------------

const KEEPALIVE_INTERVAL_MS = 60_000; // 1 minute
const keepaliveTimer = setInterval(() => {
  pool.query("SELECT 1 AS keepalive").catch(() => {
    // Connection was dead — pool will create a fresh one on next request
  });
}, KEEPALIVE_INTERVAL_MS);

if (keepaliveTimer.unref) {
  keepaliveTimer.unref();
}

// ---------------------------------------------------------------------------
// Health Check + Pool Stats
// ---------------------------------------------------------------------------

/**
 * Quick DB health check — runs a trivial query to verify connectivity.
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
