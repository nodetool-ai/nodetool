/**
 * Minimal fetch-backed PostgREST client (`/rest/v1/`), covering exactly the
 * query surface SupabaseProvider uses: select (with count/head), insert,
 * upsert (on_conflict), update, delete, the filter operators
 * eq / in / is / ilike / contains, order, limit, range, maybeSingle, and rpc.
 *
 * The fluent shape mirrors the supabase-js subset previously consumed, so
 * call sites and test fakes stay structural. Every builder is a thenable
 * resolving to `{ data, error, count }` — errors are returned, not thrown,
 * matching PostgREST's `{ message, code, details, hint }` error bodies.
 */

export interface PostgrestError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export type PostgrestRow = Record<string, unknown>;

export interface PostgrestRowsResult {
  data: PostgrestRow[] | null;
  error: PostgrestError | null;
  count: number | null;
}

export interface PostgrestMaybeSingleResult {
  data: PostgrestRow | null;
  error: PostgrestError | null;
}

export interface PostgrestRpcResult {
  data: unknown;
  error: PostgrestError | null;
}

export interface PostgrestSelectOptions {
  count?: "exact";
  head?: boolean;
}

export interface PostgrestUpsertOptions {
  onConflict?: string;
}

/** The fluent builder surface used by SupabaseProvider. */
export interface PostgrestFilterBuilder
  extends PromiseLike<PostgrestRowsResult> {
  eq(column: string, value: unknown): this;
  in(column: string, values: readonly unknown[]): this;
  is(column: string, value: null | boolean): this;
  ilike(column: string, pattern: string): this;
  contains(column: string, value: Record<string, unknown>): this;
  order(column: string, options?: { ascending?: boolean }): this;
  limit(n: number): this;
  range(from: number, to: number): this;
  maybeSingle(): PromiseLike<PostgrestMaybeSingleResult>;
}

export interface PostgrestTableApi {
  select(
    columns?: string,
    options?: PostgrestSelectOptions
  ): PostgrestFilterBuilder;
  insert(values: PostgrestRow | PostgrestRow[]): PostgrestFilterBuilder;
  upsert(
    values: PostgrestRow | PostgrestRow[],
    options?: PostgrestUpsertOptions
  ): PostgrestFilterBuilder;
  update(values: PostgrestRow): PostgrestFilterBuilder;
  delete(): PostgrestFilterBuilder;
}

/** The client surface used by SupabaseProvider (injectable in tests). */
export interface PostgrestClientApi {
  from(table: string): PostgrestTableApi;
  rpc(
    name: string,
    args: Record<string, unknown>
  ): PromiseLike<PostgrestRpcResult>;
}

export interface PostgrestClientOptions {
  /** Base URL of the Supabase project (e.g. https://xyz.supabase.co). */
  url: string;
  /** API key sent as both `apikey` and Bearer authorization. */
  apiKey: string;
  /** Postgres schema; sent via Accept-Profile / Content-Profile when not "public". */
  schema?: string;
}

// ---------------------------------------------------------------------------
// Value encoding
// ---------------------------------------------------------------------------

/** Quote one element of an `in.(...)` list per PostgREST rules. */
function quoteInElement(value: unknown): string {
  const s = String(value);
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function readErrorBody(response: Response): Promise<PostgrestError> {
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = (await response.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON error body — fall through to the status fallback.
  }
  const message =
    parsed && typeof parsed.message === "string" && parsed.message
      ? parsed.message
      : `PostgREST request failed with status ${response.status}`;
  const error: PostgrestError = { message };
  if (parsed) {
    if (typeof parsed.code === "string") error.code = parsed.code;
    if (typeof parsed.details === "string") error.details = parsed.details;
    if (typeof parsed.hint === "string") error.hint = parsed.hint;
  }
  return error;
}

/** Parse the total from a `Content-Range: 0-9/42` header. */
function parseContentRangeCount(header: string | null): number | null {
  if (!header) return null;
  const total = header.split("/")[1];
  if (!total || total === "*") return null;
  const n = Number(total);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Request state + execution
// ---------------------------------------------------------------------------

type Method = "GET" | "HEAD" | "POST" | "PATCH" | "DELETE";

interface RequestState {
  method: Method;
  body?: string;
  searchParams: URLSearchParams;
  prefer: string[];
  hasWriteBody: boolean;
}

class FilterBuilder implements PostgrestFilterBuilder {
  constructor(
    private readonly client: PostgrestClient,
    private readonly table: string,
    private readonly state: RequestState
  ) {}

  eq(column: string, value: unknown): this {
    this.state.searchParams.append(column, `eq.${String(value)}`);
    return this;
  }

  in(column: string, values: readonly unknown[]): this {
    this.state.searchParams.append(
      column,
      `in.(${values.map(quoteInElement).join(",")})`
    );
    return this;
  }

  is(column: string, value: null | boolean): this {
    this.state.searchParams.append(
      column,
      `is.${value === null ? "null" : String(value)}`
    );
    return this;
  }

  ilike(column: string, pattern: string): this {
    this.state.searchParams.append(column, `ilike.${pattern}`);
    return this;
  }

  contains(column: string, value: Record<string, unknown>): this {
    this.state.searchParams.append(column, `cs.${JSON.stringify(value)}`);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    const dir = options?.ascending === false ? "desc" : "asc";
    this.state.searchParams.append("order", `${column}.${dir}`);
    return this;
  }

  limit(n: number): this {
    this.state.searchParams.set("limit", String(n));
    return this;
  }

  range(from: number, to: number): this {
    this.state.searchParams.set("offset", String(from));
    this.state.searchParams.set("limit", String(to - from + 1));
    return this;
  }

  maybeSingle(): PromiseLike<PostgrestMaybeSingleResult> {
    this.limit(1);
    return this.execute().then((res) => ({
      data: res.data?.[0] ?? null,
      error: res.error
    }));
  }

  then<TResult1 = PostgrestRowsResult, TResult2 = never>(
    onfulfilled?:
      | ((value: PostgrestRowsResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<PostgrestRowsResult> {
    const response = await this.client.request(
      `/rest/v1/${this.table}`,
      this.state
    );
    if (!response.ok) {
      return { data: null, error: await readErrorBody(response), count: null };
    }
    const count = parseContentRangeCount(
      response.headers.get("content-range")
    );
    if (this.state.method === "HEAD") {
      return { data: null, error: null, count };
    }
    const text = await response.text();
    if (!text) {
      return { data: null, error: null, count };
    }
    const parsed = JSON.parse(text) as PostgrestRow[] | PostgrestRow;
    return {
      data: Array.isArray(parsed) ? parsed : [parsed],
      error: null,
      count
    };
  }
}

class TableApi implements PostgrestTableApi {
  constructor(
    private readonly client: PostgrestClient,
    private readonly table: string
  ) {}

  private builder(state: RequestState): FilterBuilder {
    return new FilterBuilder(this.client, this.table, state);
  }

  select(
    columns = "*",
    options: PostgrestSelectOptions = {}
  ): PostgrestFilterBuilder {
    const searchParams = new URLSearchParams();
    searchParams.set("select", columns.replace(/\s/g, ""));
    const prefer: string[] = [];
    if (options.count) prefer.push(`count=${options.count}`);
    return this.builder({
      method: options.head ? "HEAD" : "GET",
      searchParams,
      prefer,
      hasWriteBody: false
    });
  }

  insert(values: PostgrestRow | PostgrestRow[]): PostgrestFilterBuilder {
    return this.builder({
      method: "POST",
      body: JSON.stringify(values),
      searchParams: new URLSearchParams(),
      prefer: ["return=minimal"],
      hasWriteBody: true
    });
  }

  upsert(
    values: PostgrestRow | PostgrestRow[],
    options: PostgrestUpsertOptions = {}
  ): PostgrestFilterBuilder {
    const searchParams = new URLSearchParams();
    if (options.onConflict) {
      searchParams.set("on_conflict", options.onConflict);
    }
    return this.builder({
      method: "POST",
      body: JSON.stringify(values),
      searchParams,
      prefer: ["resolution=merge-duplicates", "return=minimal"],
      hasWriteBody: true
    });
  }

  update(values: PostgrestRow): PostgrestFilterBuilder {
    return this.builder({
      method: "PATCH",
      body: JSON.stringify(values),
      searchParams: new URLSearchParams(),
      prefer: ["return=minimal"],
      hasWriteBody: true
    });
  }

  delete(): PostgrestFilterBuilder {
    return this.builder({
      method: "DELETE",
      searchParams: new URLSearchParams(),
      prefer: ["return=minimal"],
      hasWriteBody: false
    });
  }
}

export class PostgrestClient implements PostgrestClientApi {
  private readonly base: string;
  private readonly apiKey: string;
  private readonly schema: string;

  constructor(options: PostgrestClientOptions) {
    let base = options.url;
    while (base.endsWith("/")) base = base.slice(0, -1);
    this.base = base;
    this.apiKey = options.apiKey;
    this.schema = options.schema ?? "public";
  }

  from(table: string): PostgrestTableApi {
    return new TableApi(this, table);
  }

  rpc(
    name: string,
    args: Record<string, unknown>
  ): PromiseLike<PostgrestRpcResult> {
    return this.executeRpc(name, args);
  }

  private async executeRpc(
    name: string,
    args: Record<string, unknown>
  ): Promise<PostgrestRpcResult> {
    const response = await this.request(`/rest/v1/rpc/${name}`, {
      method: "POST",
      body: JSON.stringify(args),
      searchParams: new URLSearchParams(),
      prefer: [],
      hasWriteBody: true
    });
    if (!response.ok) {
      return { data: null, error: await readErrorBody(response) };
    }
    const text = await response.text();
    return { data: text ? (JSON.parse(text) as unknown) : null, error: null };
  }

  /** Perform one HTTP request against the PostgREST endpoint. */
  async request(path: string, state: RequestState): Promise<Response> {
    const qs = state.searchParams.toString();
    const url = `${this.base}${path}${qs ? `?${qs}` : ""}`;
    const headers: Record<string, string> = {
      apikey: this.apiKey,
      Authorization: `Bearer ${this.apiKey}`
    };
    if (state.hasWriteBody) {
      headers["Content-Type"] = "application/json";
    }
    if (state.prefer.length > 0) {
      headers.Prefer = state.prefer.join(",");
    }
    if (this.schema !== "public") {
      if (state.method === "GET" || state.method === "HEAD") {
        headers["Accept-Profile"] = this.schema;
      } else {
        headers["Content-Profile"] = this.schema;
      }
    }
    return fetch(url, {
      method: state.method,
      headers,
      ...(state.body !== undefined ? { body: state.body } : {})
    });
  }
}
