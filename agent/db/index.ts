/**
 * RevenueOS — Database module entry point
 *
 * Re-exports the schema, relations, and seed function.
 * Provides a helper to create a Drizzle instance from a Postgres connection.
 */

export * from "./schema";
export { seedDemoData } from "./seed";
