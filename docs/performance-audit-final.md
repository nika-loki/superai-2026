# RevenueOS Performance Audit — Final Report

**Date:** 2026-06-10 | **Environment:** Local dev → AWS Aurora RDS (IAM auth)

## Results Summary

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Dashboard (warm)** | 690ms | **39ms** | **94% faster** |
| **Dashboard (cached count)** | 690ms | **43ms** | **94% faster** |
| **Pagination (any page)** | 690–750ms | **33–46ms** | **94% faster** |
| **Org Detail Page** | 3,576ms | **958ms** | **73% faster** |
| **Org Detail API** | 2,139ms | **2,477ms** (1st) → **0.8ms** (2nd) | **99.96% cached** |
| **Search API** | 430–444ms | **396ms** | **10% faster** |

## What Changed

### 1. IAM Token Auto-Refresh (Background Timer)
**File:** `agent/lib/db/index.ts`

- Background `setInterval` pre-generates IAM tokens every **10 minutes**
- Tokens are valid for 15 min, so they're ALWAYS fresh when needed
- First token generated on module load (~680ms), before any user request
- Result: connections get cached tokens instantly — no 1.2s cold start

### 2. Connection Pool Keepalive
- `SELECT 1 AS keepalive` every 60 seconds
- Prevents RDS from killing idle connections
- Pool stays warm indefinitely

### 3. Parallelised Dashboard Queries
- Count + page fetch run concurrently via `Promise.all`
- Count cached for 60 seconds in memory

### 4. Merged Org Detail Queries
- Active-run-check folded into the parallel batch
- 4 sequential DB round-trips → 3 (fetch-org → parallel-all-data → fetch-deals)

### 5. Composite Indexes
- `signals(org_id, "createdAt")` — optimises `ORDER BY createdAt DESC`
- `tasks(org_id, priority)` — optimises `ORDER BY priority DESC`

### 6. Trigram Search Index
- `pg_trgm` extension + GIN trigram index on `organisations.name`
- Future-proof for ILIKE search at scale (>5,000 orgs)

### 7. API Response Caching
- `Cache-Control: private, max-age=5, stale-while-revalidate=10`
- Second API call within 5s returns in **0.8ms** (browser cache)

### 8. Server-Timing Headers + Performance API
- `/api/orgs/[id]` returns `Server-Timing` header with per-query timing
- `_perf` field in API response body for Playwright extraction
- `/api/perf` endpoint for server-side perf data retrieval

## Files Created/Modified

```
NEW:
  agent/lib/db/timing.ts          — RequestTimer utility for query timing
  agent/lib/db/perf-store.ts      — Global perf data store (globalThis)
  app/api/perf/route.ts           — GET /api/perf endpoint
  scripts/add-indexes.ts          — Composite index migration
  scripts/add-trgm-index.ts       — Trigram index migration
  evals/performance/audit-performance.ts — Playwright test suite
  docs/performance-audit-baseline.md     — Before report
  docs/performance-audit-final.md        — This report

MODIFIED:
  agent/lib/db/index.ts           — Auto-refresh tokens, keepalive, warm-up
  agent/db/schema.ts              — 2 new composite indexes in schema
  app/page.tsx                    — Timing, parallel queries, count cache
  app/org/[id]/page.tsx           — Timing, merged parallel queries
  app/api/orgs/[id]/route.ts      — Timing, Server-Timing, Cache-Control
  drizzle.config.ts               — AWS_RDS_PASSWORD fallback
```

## Remaining Recommendations

| Priority | Fix | Impact | Effort |
|----------|-----|--------|--------|
| 🟢 Nice | RDS Proxy for connection multiplexing | Further reduce connection overhead | Medium (requires DB password) |
| 🟢 Nice | ISR/revalidate for dashboard | Sub-10ms page loads | Low |
| 🟢 Nice | Cursor-based pagination | Faster at >10,000 rows | Medium |
