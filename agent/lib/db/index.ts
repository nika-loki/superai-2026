/**
 * RevenueOS — Database Client
 *
 * Two modes based on environment:
 *
 *   - **Vercel production**: Uses RDS Data API (`@aws-sdk/client-rds-data`)
 *     over HTTPS — no VPC peering required, works from serverless functions.
 *     Credentials via Vercel OIDC → IAM role.
 *
 *   - **Local dev**: Uses `pg` with IAM auth tokens (`@aws-sdk/rds-signer`).
 *     Tokens auto-refresh in the background.
 *
 * Env vars:
 *   DB_HOST, DB_PORT, DB_NAME, DB_USER       — common
 *   DB_USE_PASSWORD + DB_PASSWORD             — bypass IAM, use direct password
 *   AWS_ROLE_ARN                               — Vercel OIDC role ARN
 *   AWS_REGION                                 — AWS region (default: us-west-2)
 *   RDS_RESOURCE_ARN                           — RDS cluster ARN (Data API)
 *   RDS_SECRET_ARN                             — Secrets Manager secret ARN (Data API)
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import * as schema from "./schema";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DB_HOST = process.env.DB_HOST;
const DB_PORT = Number(process.env.DB_PORT ?? 5432);
const DB_NAME = process.env.DB_NAME ?? "postgres";
const DB_USER = process.env.DB_USER ?? "postgres";
const DB_REGION = process.env.AWS_REGION ?? "us-west-2";
const AWS_ROLE_ARN = process.env.AWS_ROLE_ARN;
const IS_VERCEL = !!process.env.VERCEL;
const IS_DATA_API = IS_VERCEL || process.env.DB_DATA_API === "true";

if (!DB_HOST) throw new Error("DB_HOST env var is required");

const RDS_RESOURCE_ARN = process.env.RDS_RESOURCE_ARN;
const RDS_SECRET_ARN = process.env.RDS_SECRET_ARN ?? "";

if (IS_DATA_API && !RDS_RESOURCE_ARN) throw new Error("RDS_RESOURCE_ARN env var is required for Data API mode");

// Token lifecycle
const TOKEN_REFRESH_MS = 10 * 60 * 1000;
const TOKEN_CACHE_TTL_MS = 10 * 60 * 1000;
const SIGNER_REFRESH_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Data API client (Vercel / serverless)
// ---------------------------------------------------------------------------

async function createDataApiClient() {
  const { RDSDataClient } = await import("@aws-sdk/client-rds-data");
  const { drizzle } = await import("drizzle-orm/aws-data-api/pg");

  let credentials;
  if (AWS_ROLE_ARN) {
    const { awsCredentialsProvider } = await import("@vercel/oidc-aws-credentials-provider");
    credentials = awsCredentialsProvider({
      roleArn: AWS_ROLE_ARN,
      clientConfig: { region: DB_REGION },
    });
    console.log("[db] Data API with Vercel OIDC credentials");
  }

  const client = new RDSDataClient({
    region: DB_REGION,
    ...(credentials ? { credentials } : {}),
  });

  const db = drizzle(client, {
    database: DB_NAME,
    resourceArn: RDS_RESOURCE_ARN,
    secretArn: RDS_SECRET_ARN,
    schema,
  });

  console.log(`[db] ✅ Data API client ready (resource: ${RDS_RESOURCE_ARN})`);
  return { db, client };
}

// ---------------------------------------------------------------------------
// pg client (Local dev)
// ---------------------------------------------------------------------------

async function createPgClient() {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const { Signer } = await import("@aws-sdk/rds-signer");
  const { STSClient, AssumeRoleCommand } = await import("@aws-sdk/client-sts");

  // -- SSL --
  function getSSLOptions() {
    try {
      const certPath = resolve(process.cwd(), "global-bundle.pem");
      const ca = readFileSync(certPath, "utf-8");
      return { rejectUnauthorized: false, ca };
    } catch {
      return { rejectUnauthorized: false };
    }
  }

  // -- IAM Token Provider --
  async function createPasswordProvider(): Promise<() => Promise<string>> {
    if (process.env.DB_USE_PASSWORD === "true") {
      const directPassword = process.env.DB_PASSWORD ?? process.env.AWS_RDS_PASSWORD;
      if (directPassword) {
        console.log("[db] Using direct password auth (DB_USE_PASSWORD=true)");
        return () => Promise.resolve(directPassword);
      }
    }

    let cachedToken: string | null = null;
    let tokenGeneratedAt = 0;
    let signer: InstanceType<typeof Signer> | null = null;
    let signerExpiresAt = 0;

    async function getSigner(): Promise<InstanceType<typeof Signer>> {
      if (AWS_ROLE_ARN) {
        const now = Date.now();
        if (signer && now < signerExpiresAt) return signer;
        const sts = new STSClient({ region: DB_REGION });
        const { Credentials } = await sts.send(
          new AssumeRoleCommand({
            RoleArn: AWS_ROLE_ARN,
            RoleSessionName: process.env.ROLE_SESSION_NAME ?? "revenueos-dev",
            DurationSeconds: 900,
          }),
        );
        if (!Credentials) throw new Error("[db] Failed to assume role — no credentials returned");
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

      if (!signer) {
        signer = new Signer({
          hostname: DB_HOST, port: DB_PORT, username: DB_USER, region: DB_REGION,
        });
      }
      return signer;
    }

    async function generateToken(): Promise<{ token: string; durationMs: number }> {
      const start = Date.now();
      const activeSigner = await getSigner();
      const token = await activeSigner.getAuthToken();
      cachedToken = token;
      tokenGeneratedAt = Date.now();
      return { token, durationMs: Date.now() - start };
    }

    // Background refresh
    const refreshTimer = setInterval(async () => {
      try {
        const { durationMs } = await generateToken();
        console.log(`[db] 🔄 Token pre-refreshed in ${durationMs}ms — next refresh in ${TOKEN_REFRESH_MS / 1000}s`);
      } catch (err) {
        console.warn(`[db] ⚠️ Background token refresh failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }, TOKEN_REFRESH_MS);
    if (refreshTimer.unref) refreshTimer.unref();

    // Initial warm-up
    generateToken()
      .then(({ durationMs }) => console.log(`[db] 🔑 Initial IAM token generated in ${durationMs}ms`))
      .catch((err) => console.warn(`[db] ⚠️ Initial token generation failed: ${err instanceof Error ? err.message : String(err)}`));

    return async () => {
      if (cachedToken && Date.now() - tokenGeneratedAt < TOKEN_CACHE_TTL_MS) return cachedToken;
      try {
        const { token } = await generateToken();
        return token;
      } catch (err) {
        cachedToken = null;
        tokenGeneratedAt = 0;
        signer = null;
        signerExpiresAt = 0;
        throw new Error(`[db] IAM token generation failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
  }

  const passwordFn = await createPasswordProvider();

  const pool = new Pool({
    host: DB_HOST, port: DB_PORT, database: DB_NAME, user: DB_USER,
    password: passwordFn,
    ssl: getSSLOptions(),
    max: 10,
    idleTimeoutMillis: 5 * 60_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

  pool.on("error", (err) => console.error("[db] Unexpected pool error:", err.message));
  pool.on("connect", () => console.log(`[db] Connected to ${DB_HOST} (local IAM)`));

  const db = drizzle(pool, { schema });

  // Warm-up
  (async function warmUp() {
    const start = Date.now();
    try {
      await pool.query("SELECT 1 AS warmup");
      console.log(`[db] ✅ Pool warm-up complete in ${Date.now() - start}ms`);
    } catch (err) {
      console.warn(`[db] ⚠️ Pool warm-up failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();

  // Keepalive
  const keepaliveTimer = setInterval(() => {
    pool.query("SELECT 1 AS keepalive").catch(() => {});
  }, 60_000);
  if (keepaliveTimer.unref) keepaliveTimer.unref();

  return {
    db,
    pool,
    dbHealthCheck: async (): Promise<{ ok: boolean; latencyMs: number; error?: string }> => {
      const start = Date.now();
      try {
        await pool.query("SELECT 1");
        return { ok: true, latencyMs: Date.now() - start };
      } catch (err) {
        return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
      }
    },
    dbPoolStats: () => ({ total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }),
  };
}

// ---------------------------------------------------------------------------
// Initialise
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pool: any;
let _healthCheck: () => Promise<{ ok: boolean; latencyMs: number; error?: string }>;
let _poolStats: () => { total: number; idle: number; waiting: number };

if (IS_DATA_API) {
  const { db, client } = await createDataApiClient();
  _db = db;

  _healthCheck = async () => {
    const { ExecuteStatementCommand } = await import("@aws-sdk/client-rds-data");
    const start = Date.now();
    try {
      await client.send(new ExecuteStatementCommand({
        sql: "SELECT 1", resourceArn: RDS_RESOURCE_ARN, secretArn: RDS_SECRET_ARN, database: DB_NAME,
      }));
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
    }
  };

  _poolStats = () => ({ total: 0, idle: 0, waiting: 0 });
} else {
  const pg = await createPgClient();
  _db = pg.db;
  _pool = pg.pool;
  _healthCheck = pg.dbHealthCheck;
  _poolStats = pg.dbPoolStats;
}

export const db = _db;

export async function dbHealthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  return _healthCheck();
}

export function dbPoolStats(): { total: number; idle: number; waiting: number } {
  return _poolStats();
}
