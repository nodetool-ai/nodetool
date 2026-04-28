import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";

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

function getSupabaseClient(url: string, key: string): SupabaseClient {
  if (!url || !key) {
    throw new Error(
      "Supabase URL and key are required. Provide supabase_url and supabase_key."
    );
  }
  return createClient(url, key);
}

function applyFilters(query: any, filters: Filter[]): any {
  let q = query;
  for (const [field, op, value] of filters) {
    switch (op) {
      case "eq":
        q = q.eq(field, value);
        break;
      case "ne":
        q = q.neq(field, value);
        break;
      case "gt":
        q = q.gt(field, value);
        break;
      case "gte":
        q = q.gte(field, value);
        break;
      case "lt":
        q = q.lt(field, value);
        break;
      case "lte":
        q = q.lte(field, value);
        break;
      case "in":
        q = q.in(field, value as unknown[]);
        break;
      case "like":
        q = q.like(field, value as string);
        break;
      case "contains":
        q = q.contains(field, value as Record<string, unknown>);
        break;
      default:
        throw new Error(`Unsupported filter operator: ${op}`);
    }
  }
  return q;
}

export class SelectLibNode extends BaseNode {
  static readonly nodeType = "lib.supabase.Select";
  static readonly title = "Select";
  static readonly description =
    "Query records from a Supabase table.\n    supabase, database, query, select";
  static readonly metadataOutputTypes = {
    output: "any"
  };
  static readonly exposeAsTool = true;

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

    const client = getSupabaseClient(url, key);
    const selectColumns =
      cols.length === 0 ? "*" : cols.map((c) => c.name).join(", ");

    let query = client.from(tableName).select(selectColumns);

    if (filters.length > 0) {
      query = applyFilters(query, filters);
    }
    if (orderBy) {
      query = query.order(orderBy, { ascending: !descending });
    }
    if (limit > 0) {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Supabase select error: ${error.message}`);

    return { output: data ?? [] };
  }
}

export class InsertLibNode extends BaseNode {
  static readonly nodeType = "lib.supabase.Insert";
  static readonly title = "Insert";
  static readonly description =
    "Insert record(s) into a Supabase table.\n    supabase, database, insert, add, record";
  static readonly metadataOutputTypes = {
    output: "any"
  };
  static readonly exposeAsTool = true;

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

    const client = getSupabaseClient(url, key);

    let query: any = client.from(tableName).insert(data);
    if (returnRows) {
      query = query.select("*");
    }

    const { data: result, error } = await query;
    if (error) throw new Error(`Supabase insert error: ${error.message}`);

    return returnRows
      ? { output: result }
      : { output: { inserted: data.length } };
  }
}

export class UpdateLibNode extends BaseNode {
  static readonly nodeType = "lib.supabase.Update";
  static readonly title = "Update";
  static readonly description =
    "Update records in a Supabase table.\n    supabase, database, update, modify, change";
  static readonly metadataOutputTypes = {
    output: "any"
  };
  static readonly exposeAsTool = true;

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

    const client = getSupabaseClient(url, key);

    let query: any = client.from(tableName).update(values);

    if (filters.length > 0) {
      query = applyFilters(query, filters);
    }
    if (returnRows) {
      query = query.select("*");
    }

    const { data, error } = await query;
    if (error) throw new Error(`Supabase update error: ${error.message}`);

    return returnRows ? { output: data } : { output: { updated: true } };
  }
}

export class DeleteLibNode extends BaseNode {
  static readonly nodeType = "lib.supabase.Delete";
  static readonly title = "Delete";
  static readonly description =
    "Delete records from a Supabase table.\n    supabase, database, delete, remove";
  static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };
  static readonly exposeAsTool = true;

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

    const client = getSupabaseClient(url, key);

    let query: any = client.from(tableName).delete();
    query = applyFilters(query, filters);

    const { error } = await query;
    if (error) throw new Error(`Supabase delete error: ${error.message}`);

    return { output: { deleted: true } };
  }
}

export class UpsertLibNode extends BaseNode {
  static readonly nodeType = "lib.supabase.Upsert";
  static readonly title = "Upsert";
  static readonly description =
    "Insert or update (upsert) records in a Supabase table.\n    supabase, database, upsert, merge";
  static readonly metadataOutputTypes = {
    output: "any"
  };
  static readonly exposeAsTool = true;

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

    const client = getSupabaseClient(url, key);

    let query: any = client.from(tableName).upsert(data);

    if (returnRows) {
      query = query.select("*");
    }

    const { data: result, error } = await query;
    if (error) throw new Error(`Supabase upsert error: ${error.message}`);

    return returnRows
      ? { output: result }
      : { output: { upserted: data.length } };
  }
}

export class RPCLibNode extends BaseNode {
  static readonly nodeType = "lib.supabase.RPC";
  static readonly title = "RPC";
  static readonly description =
    "Call a PostgreSQL function via Supabase RPC.\n    supabase, database, rpc, function";
  static readonly metadataOutputTypes = {
    output: "any"
  };
  static readonly exposeAsTool = true;

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

    const client = getSupabaseClient(url, key);
    const { data, error } = await client.rpc(fnName, params);
    if (error) throw new Error(`Supabase RPC error: ${error.message}`);

    return { output: data };
  }
}

export const LIB_SUPABASE_NODES: readonly NodeClass[] = [
  SelectLibNode as unknown as NodeClass,
  InsertLibNode as unknown as NodeClass,
  UpdateLibNode as unknown as NodeClass,
  DeleteLibNode as unknown as NodeClass,
  UpsertLibNode as unknown as NodeClass,
  RPCLibNode as unknown as NodeClass
];
