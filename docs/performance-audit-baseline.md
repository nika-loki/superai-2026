# RevenueOS Performance Audit Report — Baseline

**Date:** 2026-06-10
**Environment:** Local dev (localhost:3000), AWS Aurora RDS PostgreSQL
**Dataset:** 953 organisations, ~200 contacts, ~50 signals, ~15 agent runs

## Executive Summary

| Metric | Value | Budget | Status |
|--------|-------|--------|--------|
| Dashboard TTFB | 634ms | < 1000ms | ✅ OK |
| Org Detail TTFB | 3,576–4,027ms | < 1500ms | ❌ 2.4–2.7x over budget |
| Org API Response | 1,886–5,123ms | < 1000ms | ❌ 1.9–5.1x over budget |
| Search Latency | 429–444ms | < 500ms | ✅ OK |
| Pagination (p1→p96) | 687–2,190ms | < 1500ms | ⚠️ Cold start 2.2s |

## Page Performance Details

### Dashboard `/` (3 sequential queries)

| Query | Duration | Notes |
|-------|----------|-------|
| `count-orgs` | 207ms | Full table scan on 953 rows |
| `page-orgs` | 206ms | ORDER BY COALESCE(score,0) DESC + LIMIT/OFFSET |
| `signal-counts` | 204ms | IN clause with 10 org IDs |
| **Total DB** | **617ms** | **Sequential — not parallelised** |
| **TTFB** | **634ms** | |

**First request cold start:** Page 1 took 2,190ms (first query 1,684ms — IAM auth token generation). Subsequent pages ~690ms.

### Org Detail `/org/[id]` (4 queries, partially parallel)

#### Canva (6 signals, 22 contacts, 2 runs)

| Query | Duration | Notes |
|-------|----------|-------|
| `fetch-org` | 1,440ms | PK lookup — slow due to IAM auth |
| `active-run-check` | 203ms | status + orgId index |
| `parallel-tab-data` | 2,174ms | 4 parallel queries (signals, tasks+join, contacts, runs) |
| `fetch-deals` | 201ms | LEFT JOIN contacts |
| **Total DB** | **4,019ms** | |
| **TTFB** | **4,027ms** | |

#### Grab (19 signals, 13 contacts, 5 tasks, 10 runs)

| Query | Duration | Notes |
|-------|----------|-------|
| `fetch-org` | 1,596ms | PK lookup — IAM auth overhead |
| `active-run-check` | 199ms | |
| `parallel-tab-data` | 1,546ms | 4 parallel — scales with data volume |
| `fetch-deals` | 208ms | |
| **Total DB** | **3,549ms** | |
| **TTFB** | **3,576ms** | |

### API Endpoint `/api/orgs/[id]`

| Org | Response Time | DB Time | Server-Timing |
|-----|--------------|---------|---------------|
| Canva | 5,123ms | 4,179ms | `db-total;dur=4179.39` |
| Grab | 2,139ms | 1,886ms | `db-total;dur=1886.46` |

### Search `/api/orgs/search?q=`

| Query | Latency | Results |
|-------|---------|---------|
| "canva" | 444ms | 1 |
| "grab" | 435ms | 2 |
| "security" | 430ms | 17 |
| "ai" | 437ms | 20 |
| "singapore" | 429ms | 1 |

### Pagination (Dashboard)

| Page | Total Latency | DB Time |
|------|--------------|---------|
| 1 (cold) | 2,190ms | 2,134ms |
| 2 | 730ms | 674ms |
| 5 | 725ms | 672ms |
| 10 | 735ms | 672ms |
| 50 | 748ms | 674ms |
| 96 | 717ms | 673ms |

✅ OFFSET performance is consistent — no degradation at high offsets with 953 rows.

## Root Cause Analysis

### 🔴 Critical: Cold-start IAM auth token generation
First DB query on a fresh connection takes 1,400–1,684ms instead of ~200ms.
The RDS IAM Signer generates a new auth token, adding ~1.2s overhead.
**Impact:** Every page's first query is ~7x slower than subsequent queries.

### 🔴 Critical: Sequential queries that could be parallel
Dashboard runs 3 queries sequentially (count → page → signals).
Only the count result is needed before the page query — the signal counts
query could run in parallel with the page query if we prefetch all org IDs.

### 🟡 Moderate: Missing composite index on `signals(orgId, createdAt)`
Signals are fetched with `WHERE orgId = ? ORDER BY createdAt DESC`.
Current index is only on `orgId`, so PostgreSQL must sort in memory.

### 🟡 Moderate: Missing composite index on `tasks(orgId, priority)`
Tasks fetched with `WHERE orgId = ? ORDER BY priority DESC`.
No composite index for this access pattern.

### 🟢 Low: Duplicate data fetch on org detail
Server component and API route run identical queries. TanStack Query
polls the API every 5s during active runs, hitting the same DB queries.
Not a problem at rest, but doubles load during active agent runs.

## Improvement Plan

| # | Fix | Expected Impact | Effort |
|---|-----|----------------|--------|
| 1 | Parallelise dashboard queries | -200ms TTFB | Low |
| 2 | Add composite indexes `(orgId, createdAt)` + `(orgId, priority)` | -50–100ms per sort | Low |
| 3 | Warm DB pool on server startup (eliminate cold start) | -1,200ms first query | Medium |
| 4 | Cache dashboard count query (revalidate every 60s) | -200ms per dashboard load | Low |
| 5 | Deduplicate org detail data (server component → API reuse) | -50% DB load during active runs | Medium |

## Files Modified

- `agent/lib/db/timing.ts` — New RequestTimer utility
- `app/page.tsx` — Instrumented with timing + `__revenueos_perf__` script tag
- `app/org/[id]/page.tsx` — Instrumented with timing
- `app/api/orgs/[id]/route.ts` — Server-Timing headers + `_perf` in response
- `evals/performance/audit-performance.ts` — Full Playwright test suite
