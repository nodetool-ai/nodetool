/**
 * Supabase database backend for NodeTool models.
 *
 * When Supabase is configured (SUPABASE_URL + SUPABASE_SERVICE_KEY env vars),
 * all CRUD operations are routed through the Supabase TypeScript SDK
 * (PostgREST). Schema migrations are handled separately via a direct
 * PostgreSQL connection using the PostgresMigrationAdapter.
 *
 * Usage:
 *   initSupabaseDb(url, serviceKey)   – call once at startup
 *   getSupabaseDb()                   – obtain the client
 *   isSupabaseMode()                  – check whether Supabase is active
 *   fromSupabaseRow(table, row)       – deserialize a Supabase row
 *   toSupabaseRow(table, row)         – serialize a row for Supabase upsert
 */

import {
  createClient,
  type SupabaseClient
} from "@supabase/supabase-js";
import type { DrizzleTable } from "./base-model.js";

// ── Client singleton ─────────────────────────────────────────────────

let _supabase: SupabaseClient | null = null;

/**
 * Initialise the Supabase client.
 * Must be called before any model operation when using Supabase mode.
 *
 * @param url        Supabase project URL (SUPABASE_URL)
 * @param serviceKey Service-role secret key (SUPABASE_SERVICE_KEY)
 */
export function initSupabaseDb(
  url: string,
  serviceKey: string
): SupabaseClient {
  _supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return _supabase;
}

/** Return the Supabase client. Throws if not initialised. */
export function getSupabaseDb(): SupabaseClient {
  if (!_supabase) {
    throw new Error(
      "Supabase is not initialised. Call initSupabaseDb() first."
    );
  }
  return _supabase;
}

/** Return true when Supabase is the active database backend. */
export function isSupabaseMode(): boolean {
  return _supabase !== null;
}

/** Reset the Supabase client (primarily for testing). */
export function closeSupabaseDb(): void {
  _supabase = null;
}

// ── Column introspection helpers ─────────────────────────────────────

/**
 * Extract the Drizzle column map from a table using the internal symbol key.
 * Each value has `mapFromDriverValue` / `mapToDriverValue` functions for
 * custom column types (e.g. jsonText, integer mode:"boolean").
 */
function getTableColumnDefs(
  table: DrizzleTable
): Record<string, Record<string, unknown>> {
  const sym = Symbol.for("drizzle:Columns");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((table as any)[sym] as Record<string, Record<string, unknown>>) ?? {};
}

// ── Row serialization ────────────────────────────────────────────────

/**
 * Convert a raw Supabase row into a model-friendly record.
 *
 * Applies each column's `mapFromDriverValue` transformation (defined by
 * Drizzle's `customType` / `integer({ mode:"boolean" })`, etc.) so that
 * JSON text is parsed and integer booleans become JS booleans.
 */
export function fromSupabaseRow(
  table: DrizzleTable,
  row: Record<string, unknown>
): Record<string, unknown> {
  const cols = getTableColumnDefs(table);
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    const col = cols[key];
    if (
      col &&
      typeof col.mapFromDriverValue === "function" &&
      value !== null &&
      value !== undefined
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result[key] = (col.mapFromDriverValue as (v: unknown) => unknown)(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Convert a model row into a Supabase-compatible record.
 *
 * Applies each column's `mapToDriverValue` transformation so that JS
 * objects are serialised to JSON strings and booleans become 0/1 integers,
 * matching the TEXT / INTEGER column types created by the migrations.
 */
export function toSupabaseRow(
  table: DrizzleTable,
  row: Record<string, unknown>
): Record<string, unknown> {
  const cols = getTableColumnDefs(table);
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      result[key] = null;
      continue;
    }

    const col = cols[key];
    if (col && typeof col.mapToDriverValue === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result[key] = (col.mapToDriverValue as (v: unknown) => unknown)(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}
