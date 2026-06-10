/**
 * In-memory perf data store.
 * Shared across the server process via globalThis.
 */

const PERF_KEY = "__revenueos_perf_store__";

function getStore(): Map<string, unknown> {
  if (!(globalThis as Record<string, unknown>)[PERF_KEY]) {
    (globalThis as Record<string, unknown>)[PERF_KEY] = new Map<string, unknown>();
  }
  return (globalThis as Record<string, unknown>)[PERF_KEY] as Map<string, unknown>;
}

export function storePerfData(page: string, data: unknown) {
  getStore().set(page, data);
}

export function getPerfData(page?: string): unknown {
  if (page) return getStore().get(page) ?? null;
  return Object.fromEntries(getStore());
}
