/**
 * `@nodetool-ai/sandbox-supabase` — PostgREST request shapes, on the host.
 *
 * Supabase's REST surface is PostgREST, and PostgREST puts the whole query in
 * the URL and the write semantics in a `Prefer` header. Both are easy to get
 * subtly wrong — an upsert without `resolution=merge-duplicates` silently
 * becomes a failed insert — so the encoding lives here and the call stays in
 * the guest.
 */

import { optionsOf } from "./limits.js";
import {
  jsonBody,
  methodOf,
  requireString,
  withQuery,
  type PreparedRequest
} from "./prepared-request.js";

function projectUrl(where: string, value: unknown): URL {
  const raw = requireString(where, value, "url");
  try {
    return new URL(raw);
  } catch {
    throw new Error(
      `${where}: url must be the project URL, e.g. https://<ref>.supabase.co`
    );
  }
}

function authHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

/**
 * A PostgREST filter bag as query parameters.
 *
 * Two forms, because both read well in different places: a raw operator
 * string (`{status: "eq.open"}`) and an operator object
 * (`{age: {gte: 18}}`).
 */
function applyFilters(url: URL, filters: unknown): void {
  if (filters === null || typeof filters !== "object") return;
  for (const [column, value] of Object.entries(
    filters as Record<string, unknown>
  )) {
    if (value === undefined || value === null) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      for (const [operator, operand] of Object.entries(
        value as Record<string, unknown>
      )) {
        if (operand === undefined || operand === null) continue;
        url.searchParams.append(column, `${operator}.${String(operand)}`);
      }
      continue;
    }
    url.searchParams.append(column, String(value));
  }
}

/**
 * Build a request against one table.
 *
 * ```js
 * import { from } from "@nodetool-ai/sandbox-supabase";
 *
 * const req = await from({
 *   url: await nodetool.secrets.get("SUPABASE_URL"),
 *   key: await nodetool.secrets.get("SUPABASE_KEY"),
 *   table: "issues",
 *   select: "id,title,status",
 *   filters: { status: "eq.open" },
 *   order: "created_at.desc",
 *   limit: 20
 * });
 * const rows = await (await fetch(req.url, req)).json;
 * ```
 *
 * `method` picks the operation: `GET` selects, `POST` inserts (or upserts with
 * `onConflict`), `PATCH` updates, `DELETE` deletes. A write returns the
 * affected rows unless `returning: "minimal"`.
 */
export async function from(options?: unknown): Promise<PreparedRequest> {
  const where = "supabase.from";
  const opts = optionsOf(options);
  const key = requireString(where, opts.key, "key");
  const table = requireString(where, opts.table, "table");
  const base = projectUrl(where, opts.url);
  const method = methodOf(opts.method, "GET");

  const url = new URL(`/rest/v1/${encodeURIComponent(table)}`, base);
  if (opts.select !== undefined && opts.select !== null) {
    url.searchParams.set("select", String(opts.select));
  }
  applyFilters(url, opts.filters);
  if (opts.order !== undefined && opts.order !== null) {
    url.searchParams.set("order", String(opts.order));
  }
  if (opts.limit !== undefined && opts.limit !== null) {
    url.searchParams.set("limit", String(opts.limit));
  }
  if (opts.offset !== undefined && opts.offset !== null) {
    url.searchParams.set("offset", String(opts.offset));
  }
  if (opts.onConflict !== undefined && opts.onConflict !== null) {
    url.searchParams.set("on_conflict", String(opts.onConflict));
  }
  withQuery(url, opts.query);

  const prefer: string[] = [];
  prefer.push(
    `return=${opts.returning === "minimal" ? "minimal" : "representation"}`
  );
  if (opts.onConflict !== undefined && opts.onConflict !== null) {
    prefer.push("resolution=merge-duplicates");
  }
  if (opts.count !== undefined && opts.count !== null) {
    prefer.push(`count=${String(opts.count)}`);
  }

  const headers: Record<string, string> = {
    ...authHeaders(key),
    Prefer: prefer.join(",")
  };
  if (opts.body === undefined || opts.body === null) {
    return { url: url.toString(), method, headers };
  }
  headers["Content-Type"] = "application/json";
  return {
    url: url.toString(),
    method,
    headers,
    body: jsonBody(where, opts.body)
  };
}

/**
 * Build a request that calls a Postgres function.
 *
 * ```js
 * const req = await rpc({ url, key, fn: "search_issues", args: { term: "flaky" } });
 * ```
 */
export async function rpc(options?: unknown): Promise<PreparedRequest> {
  const where = "supabase.rpc";
  const opts = optionsOf(options);
  const key = requireString(where, opts.key, "key");
  const fn = requireString(where, opts.fn, "fn");
  const base = projectUrl(where, opts.url);
  const url = new URL(`/rest/v1/rpc/${encodeURIComponent(fn)}`, base);
  withQuery(url, opts.query);

  return {
    url: url.toString(),
    method: methodOf(opts.method, "POST"),
    headers: { ...authHeaders(key), "Content-Type": "application/json" },
    body: jsonBody(where, opts.args ?? {})
  };
}
