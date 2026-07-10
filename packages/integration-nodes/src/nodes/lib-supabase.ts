import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import { tagAsServer } from "@nodetool-ai/nodes-utils";

type FilterOp =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "like"
  | "contains";
type Filter = [string, FilterOp, unknown];

function getSupabaseCredentials(secrets: Record<string, string>): {
  url: string;
  key: string;
} {
  const url = secrets.SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = secrets.SUPABASE_KEY || process.env.SUPABASE_KEY || "";
  if (!url || !key) {
    throw new Error(
      "Supabase URL and key are required. Set SUPABASE_URL and SUPABASE_KEY in secrets or environment."
    );
  }
  return { url, key };
}

// ---------------------------------------------------------------------------
// PostgREST request plumbing — Supabase's data API is plain PostgREST
// (`/rest/v1/`), driven by query-string operators and Prefer headers.
// ---------------------------------------------------------------------------

interface PostgrestRequest {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Path under /rest/v1/, e.g. "my_table" or "rpc/my_fn". */
  path: string;
  params: URLSearchParams;
  body?: unknown;
  prefer?: string[];
}

/** Quote one element of an `in.(...)` list per PostgREST rules. */
function quoteInElement(value: unknown): string {
  const s = String(value);
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function applyFilters(params: URLSearchParams, filters: Filter[]): void {
  for (const [field, op, value] of filters) {
    switch (op) {
      case "eq":
      case "gt":
      case "gte":
      case "lt":
      case "lte":
        params.append(field, `${op}.${String(value)}`);
        break;
      case "ne":
        params.append(field, `neq.${String(value)}`);
        break;
      case "in":
        params.append(
          field,
          `in.(${(value as unknown[]).map(quoteInElement).join(",")})`
        );
        break;
      case "like":
        params.append(field, `like.${String(value)}`);
        break;
      case "contains":
        params.append(field, `cs.${JSON.stringify(value)}`);
        break;
      default:
        throw new Error(`Unsupported filter operator: ${String(op)}`);
    }
  }
}

/**
 * Execute one PostgREST request. Returns the decoded JSON body (or null for
 * empty responses). Maps PostgREST error bodies
 * (`{ message, code, details, hint }`) to thrown Errors.
 */
async function postgrestFetch(
  supabaseUrl: string,
  apiKey: string,
  req: PostgrestRequest
): Promise<unknown> {
  let base = supabaseUrl;
  while (base.endsWith("/")) base = base.slice(0, -1);
  const qs = req.params.toString();
  const url = `${base}/rest/v1/${req.path}${qs ? `?${qs}` : ""}`;

  const headers: Record<string, string> = {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`
  };
  if (req.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (req.prefer && req.prefer.length > 0) {
    headers.Prefer = req.prefer.join(",");
  }

  const response = await fetch(url, {
    method: req.method,
    headers,
    ...(req.body !== undefined ? { body: JSON.stringify(req.body) } : {})
  });

  if (!response.ok) {
    let message = "";
    let details = "";
    try {
      const body = (await response.json()) as Record<string, unknown>;
      if (typeof body.message === "string") message = body.message;
      const parts = [body.code, body.details, body.hint]
        .filter((p): p is string => typeof p === "string" && p.length > 0)
        .join("; ");
      details = parts;
    } catch {
      // Non-JSON error body — fall back to the status line below.
    }
    const suffix = details ? ` (${details})` : "";
    throw new Error(
      `${message || `PostgREST request failed with status ${response.status}`}${suffix}`
    );
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

export class SelectLibNode extends BaseNode {
  static readonly nodeType = "lib.supabase.Select";
  static readonly title = "Select";
  static readonly inlineFields = ["table_name"];
  static readonly inputFields = [];
  static readonly description =
    "Query records from a Supabase table.\n    supabase, database, query, select";
  static readonly metadataOutputTypes = {
    output: "any"
  };

  @prop({
    type: "str",
    default: "",
    title: "Table Name",
    description: "Table to query"
  })
  declare table_name: any;

  @prop({
    type: "record_type",
    default: {
      type: "record_type",
      columns: []
    },
    title: "Columns",
    description: "Columns to select"
  })
  declare columns: any;

  @prop({
    type: "list[tuple[str, enum, any]]",
    default: [],
    title: "Filters",
    description: "List of typed filters to apply"
  })
  declare filters: any;

  @prop({
    type: "str",
    default: "",
    title: "Order By",
    description: "Column to order by"
  })
  declare order_by: any;

  @prop({
    type: "bool",
    default: false,
    title: "Descending",
    description: "Order direction"
  })
  declare descending: any;

  @prop({
    type: "int",
    default: 0,
    title: "Limit",
    description: "Max rows to return (0 = no limit)"
  })
  declare limit: any;

  @prop({
    type: "bool",
    default: false,
    title: "To Dataframe",
    description: "Return a DataframeRef instead of list of dicts"
  })
  declare to_dataframe: any;

  async process(): Promise<Record<string, unknown>> {
    const { url, key } = getSupabaseCredentials(this._secrets);
    const tableName = String(this.table_name ?? "");
    const columnsInput = (this.columns ?? { columns: [] }) as {
      columns?: Array<{ name: string }>;
    };
    const cols = columnsInput.columns ?? [];
    const filters = (this.filters ?? []) as Filter[];
    const orderBy = String(this.order_by ?? "");
    const descending = Boolean(this.descending ?? false);
    const limit = Number(this.limit ?? 0);

    if (!tableName) throw new Error("table_name cannot be empty");

    const params = new URLSearchParams();
    params.set(
      "select",
      cols.length === 0 ? "*" : cols.map((c) => c.name).join(",")
    );
    applyFilters(params, filters);
    if (orderBy) {
      params.set("order", `${orderBy}.${descending ? "desc" : "asc"}`);
    }
    if (limit > 0) {
      params.set("limit", String(limit));
    }

    try {
      const data = await postgrestFetch(url, key, {
        method: "GET",
        path: tableName,
        params
      });
      return { output: data ?? [] };
    } catch (err) {
      throw new Error(
        `Supabase select error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

export class InsertLibNode extends BaseNode {
  static readonly nodeType = "lib.supabase.Insert";
  static readonly title = "Insert";
  static readonly inlineFields = ["table_name"];
  static readonly inputFields = ["records"];
  static readonly description =
    "Insert record(s) into a Supabase table.\n    supabase, database, insert, add, record";
  static readonly metadataOutputTypes = {
    output: "any"
  };

  @prop({
    type: "str",
    default: "",
    title: "Table Name",
    description: "Table to insert into"
  })
  declare table_name: any;

  @prop({
    type: "union[list[dict[str, any]], dict[str, any]]",
    default: [],
    title: "Records",
    description: "One or multiple rows to insert"
  })
  declare records: any;

  @prop({
    type: "bool",
    default: true,
    title: "Return Rows",
    description: "Return inserted rows (uses select('*'))"
  })
  declare return_rows: any;

  async process(): Promise<Record<string, unknown>> {
    const { url, key } = getSupabaseCredentials(this._secrets);
    const tableName = String(this.table_name ?? "");
    const recordsInput = this.records ?? [];
    const returnRows = Boolean(this.return_rows ?? true);

    if (!tableName) throw new Error("table_name cannot be empty");

    const data: Record<string, unknown>[] = Array.isArray(recordsInput)
      ? (recordsInput as Record<string, unknown>[])
      : [recordsInput as Record<string, unknown>];

    const params = new URLSearchParams();
    if (returnRows) params.set("select", "*");

    try {
      const result = await postgrestFetch(url, key, {
        method: "POST",
        path: tableName,
        params,
        body: data,
        prefer: [returnRows ? "return=representation" : "return=minimal"]
      });
      return returnRows
        ? { output: result }
        : { output: { inserted: data.length } };
    } catch (err) {
      throw new Error(
        `Supabase insert error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

export class UpdateLibNode extends BaseNode {
  static readonly nodeType = "lib.supabase.Update";
  static readonly title = "Update";
  static readonly inlineFields = ["table_name"];
  static readonly inputFields = ["values"];
  static readonly description =
    "Update records in a Supabase table.\n    supabase, database, update, modify, change";
  static readonly metadataOutputTypes = {
    output: "any"
  };

  @prop({
    type: "str",
    default: "",
    title: "Table Name",
    description: "Table to update"
  })
  declare table_name: any;

  @prop({
    type: "dict[str, any]",
    default: {},
    title: "Values",
    description: "New values"
  })
  declare values: any;

  @prop({
    type: "list[tuple[str, enum, any]]",
    default: [],
    title: "Filters",
    description: "Filters to select rows to update"
  })
  declare filters: any;

  @prop({
    type: "bool",
    default: true,
    title: "Return Rows",
    description: "Return updated rows (uses select('*'))"
  })
  declare return_rows: any;

  async process(): Promise<Record<string, unknown>> {
    const { url, key } = getSupabaseCredentials(this._secrets);
    const tableName = String(this.table_name ?? "");
    const values = (this.values ?? {}) as Record<string, unknown>;
    const filters = (this.filters ?? []) as Filter[];
    const returnRows = Boolean(this.return_rows ?? true);

    if (!tableName) throw new Error("table_name cannot be empty");
    if (Object.keys(values).length === 0)
      throw new Error("values cannot be empty");

    const params = new URLSearchParams();
    applyFilters(params, filters);
    if (returnRows) params.set("select", "*");

    try {
      const data = await postgrestFetch(url, key, {
        method: "PATCH",
        path: tableName,
        params,
        body: values,
        prefer: [returnRows ? "return=representation" : "return=minimal"]
      });
      return returnRows ? { output: data } : { output: { updated: true } };
    } catch (err) {
      throw new Error(
        `Supabase update error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

export class DeleteLibNode extends BaseNode {
  static readonly nodeType = "lib.supabase.Delete";
  static readonly title = "Delete";
  static readonly inlineFields = ["table_name"];
  static readonly inputFields = [];
  static readonly description =
    "Delete records from a Supabase table.\n    supabase, database, delete, remove";
  static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };

  @prop({
    type: "str",
    default: "",
    title: "Table Name",
    description: "Table to delete from"
  })
  declare table_name: any;

  @prop({
    type: "list[tuple[str, enum, any]]",
    default: [],
    title: "Filters",
    description: "Filters to select rows to delete (required for safety)"
  })
  declare filters: any;

  async process(): Promise<Record<string, unknown>> {
    const { url, key } = getSupabaseCredentials(this._secrets);
    const tableName = String(this.table_name ?? "");
    const filters = (this.filters ?? []) as Filter[];

    if (!tableName) throw new Error("table_name cannot be empty");
    if (filters.length === 0) {
      throw new Error(
        "At least one filter is required for DELETE operations to prevent accidental data loss"
      );
    }

    const params = new URLSearchParams();
    applyFilters(params, filters);

    try {
      await postgrestFetch(url, key, {
        method: "DELETE",
        path: tableName,
        params,
        prefer: ["return=minimal"]
      });
      return { output: { deleted: true } };
    } catch (err) {
      throw new Error(
        `Supabase delete error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

export class UpsertLibNode extends BaseNode {
  static readonly nodeType = "lib.supabase.Upsert";
  static readonly title = "Upsert";
  static readonly inlineFields = ["table_name"];
  static readonly inputFields = ["records"];
  static readonly description =
    "Insert or update (upsert) records in a Supabase table.\n    supabase, database, upsert, merge";
  static readonly metadataOutputTypes = {
    output: "any"
  };

  @prop({
    type: "str",
    default: "",
    title: "Table Name",
    description: "Table to upsert into"
  })
  declare table_name: any;

  @prop({
    type: "union[list[dict[str, any]], dict[str, any]]",
    default: [],
    title: "Records",
    description: "One or multiple rows to upsert"
  })
  declare records: any;

  @prop({
    type: "bool",
    default: true,
    title: "Return Rows",
    description: "Return upserted rows (uses select('*'))"
  })
  declare return_rows: any;

  async process(): Promise<Record<string, unknown>> {
    const { url, key } = getSupabaseCredentials(this._secrets);
    const tableName = String(this.table_name ?? "");
    const recordsInput = this.records ?? [];
    const returnRows = Boolean(this.return_rows ?? true);

    if (!tableName) throw new Error("table_name cannot be empty");

    const data: Record<string, unknown>[] = Array.isArray(recordsInput)
      ? (recordsInput as Record<string, unknown>[])
      : [recordsInput as Record<string, unknown>];

    const params = new URLSearchParams();
    if (returnRows) params.set("select", "*");

    try {
      const result = await postgrestFetch(url, key, {
        method: "POST",
        path: tableName,
        params,
        body: data,
        prefer: [
          "resolution=merge-duplicates",
          returnRows ? "return=representation" : "return=minimal"
        ]
      });
      return returnRows
        ? { output: result }
        : { output: { upserted: data.length } };
    } catch (err) {
      throw new Error(
        `Supabase upsert error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

export class RPCLibNode extends BaseNode {
  static readonly nodeType = "lib.supabase.RPC";
  static readonly title = "RPC";
  static readonly inlineFields = ["function"];
  static readonly inputFields = ["params"];
  static readonly description =
    "Call a PostgreSQL function via Supabase RPC.\n    supabase, database, rpc, function";
  static readonly metadataOutputTypes = {
    output: "any"
  };

  @prop({
    type: "str",
    default: "",
    title: "Function",
    description: "RPC function name"
  })
  declare function: any;

  @prop({
    type: "dict[str, any]",
    default: {},
    title: "Params",
    description: "Function params"
  })
  declare params: any;

  @prop({
    type: "bool",
    default: false,
    title: "To Dataframe",
    description: "Return DataframeRef if result is a list of records"
  })
  declare to_dataframe: any;

  async process(): Promise<Record<string, unknown>> {
    const { url, key } = getSupabaseCredentials(this._secrets);
    const fnName = String(this.function ?? "");
    const params = (this.params ?? {}) as Record<string, unknown>;

    if (!fnName) throw new Error("function cannot be empty");

    try {
      const data = await postgrestFetch(url, key, {
        method: "POST",
        path: `rpc/${fnName}`,
        params: new URLSearchParams(),
        body: params
      });
      return { output: data };
    } catch (err) {
      throw new Error(
        `Supabase RPC error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

export const LIB_SUPABASE_NODES = tagAsServer([
  SelectLibNode as unknown as NodeClass,
  InsertLibNode as unknown as NodeClass,
  UpdateLibNode as unknown as NodeClass,
  DeleteLibNode as unknown as NodeClass,
  UpsertLibNode as unknown as NodeClass,
  RPCLibNode as unknown as NodeClass
]);
