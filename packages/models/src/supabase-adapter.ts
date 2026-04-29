/**
 * Supabase DatabaseAdapter implementation using @supabase/supabase-js.
 *
 * Port of Python's `nodetool.models.supabase_adapter.SupabaseAdapter`.
 *
 * Queries go through the Supabase JS client (PostgREST). Schema/index
 * management is intentionally not implemented — those operations are
 * handled by manual migrations executed via `nodetool migrations` (which
 * uses the `pg` driver against `DATABASE_URL`).
 */

import {
  Condition,
  ConditionBuilder,
  ConditionGroup,
  LogicalOperator,
  Operator,
  Variable
} from "./condition-builder.js";
import type {
  DatabaseAdapter,
  IndexDef,
  Row,
  TableSchema
} from "./database-adapter.js";

// `@supabase/supabase-js` is an optional peer dependency. We type it as `any`
// here so consumers that never call SupabaseAdapter don't need it installed.
type SupabaseClient = any;
type FilterBuilder = any;

// ── Type Conversion ──────────────────────────────────────────────────

function serializeValue(value: unknown, fieldType: string): unknown {
  if (value === null || value === undefined) return null;
  switch (fieldType) {
    case "datetime":
      if (value instanceof Date) return value.toISOString();
      return value;
    case "json":
      // supabase-js handles JSON-typed columns natively; pass through.
      return value;
    case "boolean":
      return Boolean(value);
    case "string":
    case "number":
      return value;
    default:
      return value;
  }
}

function deserializeValue(value: unknown, fieldType: string): unknown {
  if (value === null || value === undefined) return null;
  switch (fieldType) {
    case "datetime":
      // Supabase returns ISO strings. Leave as string for parity with SQLite adapter.
      return value;
    case "boolean":
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value !== 0;
      return Boolean(value);
    case "number":
      return typeof value === "number" ? value : Number(value);
    case "json":
    case "string":
    default:
      return value;
  }
}

function serializeRow(row: Row, schema: TableSchema): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    const fd = schema.columns[key];
    out[key] = fd ? serializeValue(value, fd.type) : value;
  }
  return out;
}

function deserializeRow(row: Row, schema: TableSchema): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    const fd = schema.columns[key];
    out[key] = fd ? deserializeValue(value, fd.type) : value;
  }
  return out;
}

// ── SupabaseAdapter ──────────────────────────────────────────────────

export class SupabaseAdapter implements DatabaseAdapter {
  readonly tableName: string;
  readonly tableSchema: TableSchema;
  private client: SupabaseClient;

  constructor(client: SupabaseClient, schema: TableSchema) {
    this.client = client;
    this.tableSchema = schema;
    this.tableName = schema.table_name;
  }

  getPrimaryKey(): string {
    return this.tableSchema.primary_key ?? "id";
  }

  /**
   * Table creation is handled by SQL migrations executed via the `pg`
   * driver (see `nodetool migrations` CLI). The Supabase JS client
   * intentionally does not expose DDL.
   */
  async createTable(): Promise<void> {
    throw new Error(
      "SupabaseAdapter.createTable: schema changes must be applied via " +
        "`nodetool migrations migrate` against DATABASE_URL."
    );
  }

  async dropTable(): Promise<void> {
    throw new Error(
      "SupabaseAdapter.dropTable: schema changes must be applied via " +
        "`nodetool migrations migrate` against DATABASE_URL."
    );
  }

  async save(item: Row): Promise<void> {
    const pk = this.getPrimaryKey();
    if (item[pk] === undefined || item[pk] === null) {
      throw new Error(`Missing primary key "${pk}" in save payload`);
    }
    const payload = serializeRow(item, this.tableSchema);
    const { error } = await this.client
      .from(this.tableName)
      .upsert(payload, { onConflict: pk });
    if (error) {
      throw new Error(
        `Supabase upsert failed for ${this.tableName}: ${error.message}`
      );
    }
  }

  async get(key: string | number): Promise<Row | null> {
    const pk = this.getPrimaryKey();
    const { data, error } = await this.client
      .from(this.tableName)
      .select("*")
      .eq(pk, key)
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(
        `Supabase get failed for ${this.tableName}.${pk}=${key}: ${error.message}`
      );
    }
    if (!data) return null;
    return deserializeRow(data as Row, this.tableSchema);
  }

  async delete(primaryKey: string | number): Promise<void> {
    const pk = this.getPrimaryKey();
    const { error } = await this.client
      .from(this.tableName)
      .delete()
      .eq(pk, primaryKey);
    if (error) {
      throw new Error(
        `Supabase delete failed for ${this.tableName}.${pk}=${primaryKey}: ${error.message}`
      );
    }
  }

  async query(
    opts: {
      condition?: ConditionBuilder;
      orderBy?: string;
      limit?: number;
      reverse?: boolean;
      columns?: string[];
    } = {}
  ): Promise<[Row[], string]> {
    const { condition, orderBy, limit = 100, reverse = false, columns } = opts;
    const pk = this.getPrimaryKey();

    const select =
      columns && columns.length > 0 && !columns.includes("*")
        ? columns.join(", ")
        : "*";

    let q: FilterBuilder = this.client.from(this.tableName).select(select);

    if (condition) {
      q = this._applyCondition(q, condition.build());
    }

    const orderCol = orderBy ?? pk;
    q = q.order(orderCol, { ascending: !reverse });

    const fetchLimit = limit + 1;
    q = q.limit(fetchLimit);

    const { data, error } = await q;
    if (error) {
      throw new Error(
        `Supabase query failed for ${this.tableName}: ${error.message}`
      );
    }
    if (!data || data.length === 0) {
      return [[], ""];
    }

    const rows = (data as Row[]).map((r) =>
      deserializeRow(r, this.tableSchema)
    );

    if (rows.length <= limit) {
      return [rows, ""];
    }
    rows.pop();
    const last = rows[rows.length - 1];
    const cursor = last && last[pk] != null ? String(last[pk]) : "";
    return [rows, cursor];
  }

  /**
   * Apply a ConditionBuilder tree to a PostgREST FilterBuilder.
   *
   * AND groups translate to chained filter calls (PostgREST's default).
   * OR groups translate to a single `.or(...)` filter expression.
   */
  private _applyCondition(
    q: FilterBuilder,
    cond: Condition | ConditionGroup
  ): FilterBuilder {
    if (cond instanceof Condition) {
      return this._applyLeaf(q, cond);
    }

    // ConditionGroup
    if (cond.operator === LogicalOperator.AND) {
      let cur = q;
      for (const sub of cond.conditions) {
        cur = this._applyCondition(cur, sub);
      }
      return cur;
    }

    // OR — must be expressed as a single PostgREST `or` filter string.
    const parts: string[] = [];
    for (const sub of cond.conditions) {
      const expr = this._renderForOr(sub);
      if (expr) parts.push(expr);
    }
    if (parts.length === 0) return q;
    return q.or(parts.join(","));
  }

  private _applyLeaf(q: FilterBuilder, c: Condition): FilterBuilder {
    if (c.value instanceof Variable) {
      // Unbound variables are not supported in remote queries.
      return q;
    }
    const v = c.value;
    switch (c.operator) {
      case Operator.EQ:
        return q.eq(c.field, v);
      case Operator.NE:
        return q.neq(c.field, v);
      case Operator.GT:
        return q.gt(c.field, v);
      case Operator.GTE:
        return q.gte(c.field, v);
      case Operator.LT:
        return q.lt(c.field, v);
      case Operator.LTE:
        return q.lte(c.field, v);
      case Operator.IN:
      case Operator.CONTAINS: {
        const arr = Array.isArray(v) ? v : [v];
        return q.in(c.field, arr);
      }
      case Operator.LIKE:
        return q.like(c.field, v);
      case Operator.IS_NULL:
        return q.is(c.field, null);
      case Operator.IS_NOT_NULL:
        return q.not(c.field, "is", null);
      default:
        throw new Error(
          `SupabaseAdapter: unsupported operator ${c.operator}`
        );
    }
  }

  /**
   * Render a sub-condition as a PostgREST filter-string fragment usable
   * inside an `.or(...)` call. PostgREST's grammar:
   *   <field>.<op>.<value>     (leaf)
   *   and(<frag>,<frag>,...)   (nested AND)
   *   or(<frag>,<frag>,...)    (nested OR)
   */
  private _renderForOr(cond: Condition | ConditionGroup): string {
    if (cond instanceof Condition) {
      if (cond.value instanceof Variable) return "";
      return this._renderLeafForOr(cond);
    }
    const inner = cond.conditions
      .map((sub) => this._renderForOr(sub))
      .filter((s) => s.length > 0)
      .join(",");
    if (!inner) return "";
    const kw = cond.operator === LogicalOperator.AND ? "and" : "or";
    return `${kw}(${inner})`;
  }

  private _renderLeafForOr(c: Condition): string {
    const f = c.field;
    const renderVal = (v: unknown): string => {
      if (v === null) return "null";
      if (Array.isArray(v))
        return `(${v.map((x) => String(x)).join(",")})`;
      return String(v);
    };
    switch (c.operator) {
      case Operator.EQ:
        return `${f}.eq.${renderVal(c.value)}`;
      case Operator.NE:
        return `${f}.neq.${renderVal(c.value)}`;
      case Operator.GT:
        return `${f}.gt.${renderVal(c.value)}`;
      case Operator.GTE:
        return `${f}.gte.${renderVal(c.value)}`;
      case Operator.LT:
        return `${f}.lt.${renderVal(c.value)}`;
      case Operator.LTE:
        return `${f}.lte.${renderVal(c.value)}`;
      case Operator.IN:
      case Operator.CONTAINS: {
        const arr = Array.isArray(c.value) ? c.value : [c.value];
        return `${f}.in.(${arr.map((x) => String(x)).join(",")})`;
      }
      case Operator.LIKE:
        return `${f}.like.${renderVal(c.value)}`;
      case Operator.IS_NULL:
        return `${f}.is.null`;
      case Operator.IS_NOT_NULL:
        return `${f}.not.is.null`;
      default:
        throw new Error(
          `SupabaseAdapter: unsupported operator in OR group: ${c.operator}`
        );
    }
  }

  async createIndex(): Promise<void> {
    throw new Error(
      "SupabaseAdapter.createIndex: indexes must be created via SQL migrations."
    );
  }

  async dropIndex(): Promise<void> {
    throw new Error(
      "SupabaseAdapter.dropIndex: indexes must be dropped via SQL migrations."
    );
  }

  async listIndexes(): Promise<IndexDef[]> {
    // Listing indexes via the JS client is not supported. Use pg_catalog
    // through the migrations CLI if needed.
    return [];
  }
}

// ── SupabaseAdapterFactory ───────────────────────────────────────────

export class SupabaseAdapterFactory {
  private client: SupabaseClient;
  private adapters = new Map<string, SupabaseAdapter>();

  /**
   * @param client A `@supabase/supabase-js` client created with
   *   `createClient(url, serviceRoleKey, ...)`.
   */
  constructor(client: SupabaseClient) {
    this.client = client;
  }

  getAdapter(schema: TableSchema): SupabaseAdapter {
    let a = this.adapters.get(schema.table_name);
    if (!a) {
      a = new SupabaseAdapter(this.client, schema);
      this.adapters.set(schema.table_name, a);
    }
    return a;
  }
}

/**
 * Create a Supabase client from environment variables.
 *
 * Looks up `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or
 * `SUPABASE_ANON_KEY` if no service role key is set).
 *
 * @throws if `@supabase/supabase-js` is not installed or env vars are missing.
 */
export async function createSupabaseClientFromEnv(): Promise<SupabaseClient> {
  const url = process.env["SUPABASE_URL"];
  const key =
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
    process.env["SUPABASE_ANON_KEY"];
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) must be set"
    );
  }
  let mod: { createClient: (url: string, key: string) => SupabaseClient };
  try {
    mod = (await import("@supabase/supabase-js")) as unknown as typeof mod;
  } catch {
    throw new Error(
      "@supabase/supabase-js is not installed. Install it to use SupabaseAdapter."
    );
  }
  return mod.createClient(url, key);
}
