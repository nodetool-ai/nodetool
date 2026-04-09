import { BaseNode, prop } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import { promises as fs } from "node:fs";
import path from "node:path";

type Row = Record<string, unknown>;
function asRows(value: unknown): Row[] {
  if (Array.isArray(value)) {
    return value
      .filter(
        (x): x is Row => !!x && typeof x === "object" && !Array.isArray(x)
      )
      .map((x) => ({ ...x }));
  }
  if (value && typeof value === "object") {
    const obj = value as { rows?: unknown; data?: unknown };
    if (Array.isArray(obj.rows)) return asRows(obj.rows);
    if (Array.isArray(obj.data)) return asRows(obj.data);
  }
  return [];
}

function toDataframe(rows: Row[]): { rows: Row[] } {
  return { rows };
}

function parseCsvValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric)) return numeric;
  return trimmed;
}

function parseCsv(csv: string): Row[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = lines[i].split(",");
    const row: Row = {};
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = parseCsvValue(values[j] ?? "");
    }
    rows.push(row);
  }
  return rows;
}

function toCsv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => String(row[h] ?? "")).join(","));
  }
  return lines.join("\n");
}

function parseConditionExpr(condition: string): string {
  return condition
    .replace(/\band\b/g, "&&")
    .replace(/\bor\b/g, "||")
    .replace(/\bnot\b/g, "!");
}

function applyFilter(rows: Row[], condition: string): Row[] {
  const trimmed = condition.trim();
  if (!trimmed) return rows;
  const expr = parseConditionExpr(trimmed);
  return rows.filter((row) => {
    try {
      const fn = new Function("row", `with (row) { return Boolean(${expr}); }`);
      return Boolean(fn(row));
    } catch {
      return false;
    }
  });
}

function uniqueRows(rows: Row[]): Row[] {
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const row of rows) {
    const key = JSON.stringify(row, Object.keys(row).sort());
    if (!seen.has(key)) {
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

function toNumber(value: unknown): number {
  if (value == null || value === "") return NaN;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function mean(values: number[]): number {
  return values.length === 0 ? NaN : sum(values) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function dateName(name: string): string {
  const now = new Date();
  const pad = (v: number): string => String(v).padStart(2, "0");
  return name
    .replaceAll("%Y", String(now.getFullYear()))
    .replaceAll("%m", pad(now.getMonth() + 1))
    .replaceAll("%d", pad(now.getDate()))
    .replaceAll("%H", pad(now.getHours()))
    .replaceAll("%M", pad(now.getMinutes()))
    .replaceAll("%S", pad(now.getSeconds()));
}

export class SchemaNode extends BaseNode {
  static readonly nodeType = "nodetool.data.Schema";
  static readonly title = "Schema";
  static readonly description =
    "Define a schema for a dataframe.\n    schema, dataframe, create";
  static readonly metadataOutputTypes = {
    output: "record_type"
  };

  @prop({
    type: "record_type",
    default: {
      type: "record_type",
      columns: []
    },
    title: "Columns",
    description: "The columns to use in the dataframe."
  })
  declare columns: any;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.columns ?? {} };
  }
}

export class FilterDataframeNode extends BaseNode {
  static readonly nodeType = "nodetool.data.Filter";
  static readonly title = "Filter";
  static readonly description =
    "Filter dataframe based on condition.\n    filter, query, condition\n\n    Example conditions:\n    age > 30\n    age > 30 and salary < 50000\n    name == 'John Doe'\n    100 <= price <= 200\n    status in ['Active', 'Pending']\n    not (age < 18)\n\n    Use cases:\n    - Extract subset of data meeting specific criteria\n    - Remove outliers or invalid data points\n    - Focus analysis on relevant data segments";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Df",
    description: "The DataFrame to filter."
  })
  declare df: any;

  @prop({
    type: "str",
    default: "",
    title: "Condition",
    description:
      "The filtering condition to be applied to the DataFrame, e.g. column_name > 5."
  })
  declare condition: any;

  async process(): Promise<Record<string, unknown>> {
    const rows = asRows(this.df ?? this.df);
    const condition = String(this.condition ?? this.condition ?? "");
    return { output: toDataframe(applyFilter(rows, condition)) };
  }
}

export class SliceDataframeNode extends BaseNode {
  static readonly nodeType = "nodetool.data.Slice";
  static readonly title = "Slice";
  static readonly description =
    "Slice a dataframe by rows using start and end indices.\n    slice, subset, rows\n\n    Use cases:\n    - Extract a specific range of rows from a large dataset\n    - Create training and testing subsets for machine learning\n    - Analyze data in smaller chunks";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Dataframe",
    description: "The input dataframe to be sliced."
  })
  declare dataframe: any;

  @prop({
    type: "int",
    default: 0,
    title: "Start Index",
    description: "The starting index of the slice (inclusive)."
  })
  declare start_index: any;

  @prop({
    type: "int",
    default: -1,
    title: "End Index",
    description:
      "The ending index of the slice (exclusive). Use -1 for the last row."
  })
  declare end_index: any;

  async process(): Promise<Record<string, unknown>> {
    const rows = asRows(this.dataframe ?? this.dataframe);
    const start = Number(this.start_index ?? this.start_index ?? 0);
    let end = Number(this.end_index ?? this.end_index ?? -1);
    if (end < 0) end = rows.length;
    return { output: toDataframe(rows.slice(start, end)) };
  }
}

export class SaveDataframeNode extends BaseNode {
  static readonly nodeType = "nodetool.data.SaveDataframe";
  static readonly title = "Save Dataframe";
  static readonly description =
    "Save dataframe in specified folder.\n    csv, folder, save\n\n    Use cases:\n    - Export processed data for external use\n    - Create backups of dataframes";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Df"
  })
  declare df: any;

  @prop({
    type: "folder",
    default: {
      type: "folder",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Folder",
    description: "Name of the output folder."
  })
  declare folder: any;

  @prop({
    type: "str",
    default: "output.csv",
    title: "Name",
    description:
      "\n        Name of the output file.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        "
  })
  declare name: any;

  async process(): Promise<Record<string, unknown>> {
    const rows = asRows(this.df ?? this.df);
    const folder = String(this.folder ?? this.folder ?? ".");
    const filename = dateName(String(this.name ?? this.name ?? "output.csv"));
    const full = path.resolve(folder, filename);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, toCsv(rows), "utf8");
    return { output: toDataframe(rows), path: full };
  }
}

export class ImportCSVNode extends BaseNode {
  static readonly nodeType = "nodetool.data.ImportCSV";
  static readonly title = "Import CSV";
  static readonly description =
    "Convert CSV string to dataframe.\n    csv, dataframe, import\n\n    Use cases:\n    - Import CSV data from string input\n    - Convert CSV responses from APIs to dataframe";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "CSV Data",
    description: "String input of CSV formatted text."
  })
  declare csv_data: any;

  async process(): Promise<Record<string, unknown>> {
    const csv = String(this.csv_data ?? this.csv_data ?? "");
    return { output: toDataframe(parseCsv(csv)) };
  }
}

export class LoadCSVURLNode extends BaseNode {
  static readonly nodeType = "nodetool.data.LoadCSVURL";
  static readonly title = "Load CSVURL";
  static readonly description =
    "Load CSV file from URL.\n    csv, dataframe, import";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Url",
    description: "The URL of the CSV file to load."
  })
  declare url: any;

  async process(): Promise<Record<string, unknown>> {
    const url = String(this.url ?? this.url ?? "");
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch CSV URL: ${response.status}`);
    }
    const csv = await response.text();
    return { output: toDataframe(parseCsv(csv)) };
  }
}

export class LoadCSVFileDataNode extends BaseNode {
  static readonly nodeType = "nodetool.data.LoadCSVFile";
  static readonly title = "Load CSVFile";
  static readonly description =
    "Load CSV file from file path.\n    csv, dataframe, import";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "File Path",
    description: "The path to the CSV file to load."
  })
  declare file_path: any;

  async process(): Promise<Record<string, unknown>> {
    const file = String(this.file_path ?? this.file_path ?? "");
    if (!file) throw new Error("file_path cannot be empty");
    const csv = await fs.readFile(file, "utf8");
    return { output: toDataframe(parseCsv(csv)) };
  }
}

export class FromListNode extends BaseNode {
  static readonly nodeType = "nodetool.data.FromList";
  static readonly title = "From List";
  static readonly description =
    "Convert list of dicts to dataframe.\n    list, dataframe, convert\n\n    Use cases:\n    - Transform list data into structured dataframe\n    - Prepare list data for analysis or visualization\n    - Convert API responses to dataframe format";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "list[any]",
    default: [],
    title: "Values",
    description: "List of values to be converted, each value will be a row."
  })
  declare values: any;

  async process(): Promise<Record<string, unknown>> {
    const values = Array.isArray(this.values ?? this.values)
      ? ((this.values ?? this.values) as unknown[])
      : [];
    const rows: Row[] = [];
    for (const item of values) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error("List must contain dicts.");
      }
      const row: Row = {};
      for (const [k, v] of Object.entries(item as Row)) {
        if (
          v &&
          typeof v === "object" &&
          !Array.isArray(v) &&
          "value" in (v as Row)
        ) {
          row[k] = (v as Row).value;
        } else if (
          typeof v === "number" ||
          typeof v === "string" ||
          typeof v === "boolean" ||
          v == null
        ) {
          row[k] = v;
        } else {
          row[k] = String(v);
        }
      }
      rows.push(row);
    }
    return { output: toDataframe(rows) };
  }
}

export class JSONToDataframeNode extends BaseNode {
  static readonly nodeType = "nodetool.data.JSONToDataframe";
  static readonly title = "Convert JSON to DataFrame";
  static readonly description =
    "Transforms a JSON string into a pandas DataFrame.\n    json, dataframe, conversion\n\n    Use cases:\n    - Converting API responses to tabular format\n    - Preparing JSON data for analysis or visualization\n    - Structuring unstructured JSON data for further processing";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly exposeAsTool = true;

  @prop({ type: "str", default: "", title: "JSON" })
  declare text: any;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? this.text ?? "[]");
    const parsed = JSON.parse(text);
    return { output: toDataframe(asRows(parsed)) };
  }
}

export class ToListNode extends BaseNode {
  static readonly nodeType = "nodetool.data.ToList";
  static readonly title = "To List";
  static readonly description =
    "Convert dataframe to list of dictionaries.\n    dataframe, list, convert\n\n    Use cases:\n    - Convert dataframe data for API consumption\n    - Transform data for JSON serialization\n    - Prepare data for document-based storage";
  static readonly metadataOutputTypes = {
    output: "list[dict]"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Dataframe",
    description: "The input dataframe to convert."
  })
  declare dataframe: any;

  async process(): Promise<Record<string, unknown>> {
    return { output: asRows(this.dataframe ?? this.dataframe) };
  }
}

export class SelectColumnNode extends BaseNode {
  static readonly nodeType = "nodetool.data.SelectColumn";
  static readonly title = "Select Column";
  static readonly description =
    "Select specific columns from dataframe.\n    dataframe, columns, filter\n\n    Use cases:\n    - Extract relevant features for analysis\n    - Reduce dataframe size by removing unnecessary columns\n    - Prepare data for specific visualizations or models";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Dataframe",
    description: "a dataframe from which columns are to be selected"
  })
  declare dataframe: any;

  @prop({
    type: "str",
    default: "",
    title: "Columns",
    description: "comma separated list of column names"
  })
  declare columns: any;

  async process(): Promise<Record<string, unknown>> {
    const rows = asRows(this.dataframe ?? this.dataframe);
    const cols = String(this.columns ?? this.columns ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cols.length === 0) return { output: toDataframe(rows) };
    return {
      output: toDataframe(
        rows.map((row) => Object.fromEntries(cols.map((c) => [c, row[c]])))
      )
    };
  }
}

export class ExtractColumnNode extends BaseNode {
  static readonly nodeType = "nodetool.data.ExtractColumn";
  static readonly title = "Extract Column";
  static readonly description =
    "Convert dataframe column to list.\n    dataframe, column, list\n\n    Use cases:\n    - Extract data for use in other processing steps\n    - Prepare column data for plotting or analysis\n    - Convert categorical data to list for encoding";
  static readonly metadataOutputTypes = {
    output: "list[any]"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Dataframe",
    description: "The input dataframe."
  })
  declare dataframe: any;

  @prop({
    type: "str",
    default: "",
    title: "Column Name",
    description: "The name of the column to be converted to a list."
  })
  declare column_name: any;

  async process(): Promise<Record<string, unknown>> {
    const rows = asRows(this.dataframe ?? this.dataframe);
    const column = String(this.column_name ?? this.column_name ?? "");
    return { output: rows.map((row) => row[column]) };
  }
}

export class AddColumnNode extends BaseNode {
  static readonly nodeType = "nodetool.data.AddColumn";
  static readonly title = "Add Column";
  static readonly description =
    "Add list of values as new column to dataframe.\n    dataframe, column, list\n\n    Use cases:\n    - Incorporate external data into existing dataframe\n    - Add calculated results as new column\n    - Augment dataframe with additional features";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Dataframe",
    description: "Dataframe object to add a new column to."
  })
  declare dataframe: any;

  @prop({
    type: "str",
    default: "",
    title: "Column Name",
    description: "The name of the new column to be added to the dataframe."
  })
  declare column_name: any;

  @prop({
    type: "list[any]",
    default: [],
    title: "Values",
    description:
      "A list of any type of elements which will be the new column's values."
  })
  declare values: any;

  async process(): Promise<Record<string, unknown>> {
    const rows = asRows(this.dataframe ?? this.dataframe);
    const column = String(this.column_name ?? this.column_name ?? "");
    const values = Array.isArray(this.values ?? this.values)
      ? ((this.values ?? this.values) as unknown[])
      : [];
    return {
      output: toDataframe(
        rows.map((row, i) => ({
          ...row,
          [column]: values[i]
        }))
      )
    };
  }
}

export class MergeDataframeNode extends BaseNode {
  static readonly nodeType = "nodetool.data.Merge";
  static readonly title = "Merge";
  static readonly description =
    "Merge two dataframes along columns.\n    merge, concat, columns\n\n    Use cases:\n    - Combine data from multiple sources\n    - Add new features to existing dataframe\n    - Merge time series data from different periods";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Dataframe A",
    description: "First DataFrame to be merged."
  })
  declare dataframe_a: any;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Dataframe B",
    description: "Second DataFrame to be merged."
  })
  declare dataframe_b: any;

  async process(): Promise<Record<string, unknown>> {
    const a = asRows(this.dataframe_a ?? this.dataframe_a);
    const b = asRows(this.dataframe_b ?? this.dataframe_b);
    const len = Math.max(a.length, b.length);
    const out: Row[] = [];
    for (let i = 0; i < len; i += 1) {
      out.push({ ...(a[i] ?? {}), ...(b[i] ?? {}) });
    }
    return { output: toDataframe(out) };
  }
}

export class AppendDataframeNode extends BaseNode {
  static readonly nodeType = "nodetool.data.Append";
  static readonly title = "Append";
  static readonly description =
    "Append two dataframes along rows.\n    append, concat, rows\n\n    Use cases:\n    - Combine data from multiple time periods\n    - Merge datasets with same structure\n    - Aggregate data from different sources";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Dataframe A",
    description: "First DataFrame to be appended."
  })
  declare dataframe_a: any;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Dataframe B",
    description: "Second DataFrame to be appended."
  })
  declare dataframe_b: any;

  async process(): Promise<Record<string, unknown>> {
    const a = asRows(this.dataframe_a ?? this.dataframe_a);
    const b = asRows(this.dataframe_b ?? this.dataframe_b);
    if (a.length === 0) return { output: toDataframe(b) };
    if (b.length === 0) return { output: toDataframe(a) };
    const aCols = Object.keys(a[0]).sort().join(",");
    const bCols = Object.keys(b[0]).sort().join(",");
    if (aCols !== bCols) {
      throw new Error(
        "Columns in dataframe A do not match columns in dataframe B"
      );
    }
    return { output: toDataframe([...a, ...b]) };
  }
}

export class JoinDataframeNode extends BaseNode {
  static readonly nodeType = "nodetool.data.Join";
  static readonly title = "Join";
  static readonly description =
    "Join two dataframes on specified column.\n    join, merge, column\n\n    Use cases:\n    - Combine data from related tables\n    - Enrich dataset with additional information\n    - Link data based on common identifiers";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Dataframe A",
    description: "First DataFrame to be merged."
  })
  declare dataframe_a: any;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Dataframe B",
    description: "Second DataFrame to be merged."
  })
  declare dataframe_b: any;

  @prop({
    type: "str",
    default: "",
    title: "Join On",
    description: "The column name on which to join the two dataframes."
  })
  declare join_on: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const a = asRows(this.dataframe_a ?? this.dataframe_a);
    const b = asRows(this.dataframe_b ?? this.dataframe_b);
    const joinOn = String(this.join_on ?? this.join_on ?? "");

    // Validate join column exists in both dataframes
    const colsA = a.length > 0 ? Object.keys(a[0]) : [];
    const colsB = b.length > 0 ? Object.keys(b[0]) : [];
    if (joinOn && a.length > 0 && !colsA.includes(joinOn)) {
      throw new Error(
        `Join column '${joinOn}' not found in dataframe A. Available columns: ${colsA.join(", ")}`
      );
    }
    if (joinOn && b.length > 0 && !colsB.includes(joinOn)) {
      throw new Error(
        `Join column '${joinOn}' not found in dataframe B. Available columns: ${colsB.join(", ")}`
      );
    }

    // Warn about column collisions (excluding the join column)
    const colsASet = new Set(colsA.filter((c) => c !== joinOn));
    const colsBSet = new Set(colsB.filter((c) => c !== joinOn));
    const collisions = [...colsASet].filter((c) => colsBSet.has(c));
    if (collisions.length > 0 && context && typeof context.emit === "function") {
      const nodeId = String(
        (this as unknown as Record<string, unknown>).__node_id ??
          (this as unknown as Record<string, unknown>).name ??
          ""
      );
      context.emit({
        type: "node_progress",
        node_id: nodeId,
        progress: 0,
        total: 0
      });
      console.warn(
        `Join: columns [${collisions.join(", ")}] exist in both dataframes and will be overwritten by dataframe B values.`
      );
    }

    const mapB = new Map<unknown, Row[]>();
    for (const row of b) {
      const key = row[joinOn];
      if (!mapB.has(key)) mapB.set(key, []);
      mapB.get(key)!.push(row);
    }
    const out: Row[] = [];
    for (const row of a) {
      const matches = mapB.get(row[joinOn]) ?? [];
      for (const m of matches) {
        out.push({ ...row, ...m });
      }
    }
    return { output: toDataframe(out) };
  }
}

export class RowIteratorNode extends BaseNode {
  static readonly nodeType = "nodetool.data.RowIterator";
  static readonly title = "Row Iterator";
  static readonly description = "Iterate over rows of a dataframe.";
  static readonly metadataOutputTypes = {
    dict: "dict",
    index: "any"
  };

  static readonly isStreamingOutput = true;
  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Dataframe",
    description: "The input dataframe."
  })
  declare dataframe: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const rows = asRows(this.dataframe ?? this.dataframe);
    for (const [index, row] of rows.entries()) {
      yield { dict: row, index };
    }
  }
}

export class FindRowNode extends BaseNode {
  static readonly nodeType = "nodetool.data.FindRow";
  static readonly title = "Find Row";
  static readonly description =
    "Find the first row in a dataframe that matches a given condition.\n    filter, query, condition, single row\n\n    Example conditions:\n    age > 30\n    age > 30 and salary < 50000\n    name == 'John Doe'\n    100 <= price <= 200\n    status in ['Active', 'Pending']\n    not (age < 18)\n\n    Use cases:\n    - Retrieve specific record based on criteria\n    - Find first occurrence of a particular condition\n    - Extract single data point for further analysis";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Df",
    description: "The DataFrame to search."
  })
  declare df: any;

  @prop({
    type: "str",
    default: "",
    title: "Condition",
    description:
      "The condition to filter the DataFrame, e.g. 'column_name == value'."
  })
  declare condition: any;

  async process(): Promise<Record<string, unknown>> {
    const rows = asRows(this.df ?? this.df);
    const condition = String(this.condition ?? this.condition ?? "");
    const filtered = applyFilter(rows, condition).slice(0, 1);
    return { output: toDataframe(filtered) };
  }
}

export class SortByColumnNode extends BaseNode {
  static readonly nodeType = "nodetool.data.SortByColumn";
  static readonly title = "Sort By Column";
  static readonly description =
    "Sort dataframe by specified column.\n    sort, order, column\n\n    Use cases:\n    - Arrange data in ascending or descending order\n    - Identify top or bottom values in dataset\n    - Prepare data for rank-based analysis";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Df"
  })
  declare df: any;

  @prop({
    type: "str",
    default: "",
    title: "Column",
    description: "The column to sort the DataFrame by."
  })
  declare column: any;

  async process(): Promise<Record<string, unknown>> {
    const rows = asRows(this.df ?? this.df);
    const col = String(this.column ?? this.column ?? "");
    const sorted = [...rows].sort((a, b) => {
      const left = a[col];
      const right = b[col];
      const leftNum = toNumber(left);
      const rightNum = toNumber(right);
      if (Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
        return leftNum - rightNum;
      }
      return String(left ?? "").localeCompare(String(right ?? ""));
    });
    return { output: toDataframe(sorted) };
  }
}

export class DropDuplicatesNode extends BaseNode {
  static readonly nodeType = "nodetool.data.DropDuplicates";
  static readonly title = "Drop Duplicates";
  static readonly description =
    "Remove duplicate rows from dataframe.\n    duplicates, unique, clean\n\n    Use cases:\n    - Clean dataset by removing redundant entries\n    - Ensure data integrity in analysis\n    - Prepare data for unique value operations";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Df",
    description: "The input DataFrame."
  })
  declare df: any;

  async process(): Promise<Record<string, unknown>> {
    const rows = asRows(this.df ?? this.df);
    return { output: toDataframe(uniqueRows(rows)) };
  }
}

export class DropNANode extends BaseNode {
  static readonly nodeType = "nodetool.data.DropNA";
  static readonly title = "Drop NA";
  static readonly description =
    "Remove rows with NA values from dataframe.\n    na, missing, clean\n\n    Use cases:\n    - Clean dataset by removing incomplete entries\n    - Prepare data for analysis requiring complete cases\n    - Improve data quality for modeling";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Df",
    description: "The input DataFrame."
  })
  declare df: any;

  async process(): Promise<Record<string, unknown>> {
    const rows = asRows(this.df ?? this.df);
    const out = rows.filter((row) =>
      Object.values(row).every(
        (v) => v !== null && v !== undefined && !Number.isNaN(v)
      )
    );
    return { output: toDataframe(out) };
  }
}

export class ForEachRowNode extends BaseNode {
  static readonly nodeType = "nodetool.data.ForEachRow";
  static readonly title = "For Each Row";
  static readonly description =
    "Iterate over rows of a dataframe.\n    iterator, loop, dataframe, sequence, rows\n\n    Use cases:\n    - Process each row of a dataframe individually\n    - Trigger actions for every record in a dataset";
  static readonly metadataOutputTypes = {
    row: "dict",
    index: "any"
  };
  static readonly exposeAsTool = true;

  static readonly isStreamingOutput = true;
  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Dataframe",
    description: "The input dataframe."
  })
  declare dataframe: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const rows = asRows(this.dataframe ?? this.dataframe);
    for (const [index, row] of rows.entries()) {
      yield { row, index };
    }
  }
}

export class LoadCSVAssetsNode extends BaseNode {
  static readonly nodeType = "nodetool.data.LoadCSVAssets";
  static readonly title = "Load CSV Assets";
  static readonly description =
    "Load dataframes from an asset folder.\n    load, dataframe, file, import\n\n    Use cases:\n    - Load multiple dataframes from a folder\n    - Process multiple datasets in sequence\n    - Batch import of data files";
  static readonly metadataOutputTypes = {
    dataframe: "dataframe",
    name: "str"
  };
  static readonly exposeAsTool = true;

  static readonly isStreamingOutput = true;
  @prop({
    type: "folder",
    default: {
      type: "folder",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Folder",
    description: "The asset folder to load the dataframes from."
  })
  declare folder: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const folder = String(this.folder ?? this.folder ?? ".");
    const entries = await fs.readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".csv"))
        continue;
      const full = path.join(folder, entry.name);
      const csv = await fs.readFile(full, "utf8");
      yield { name: entry.name, dataframe: toDataframe(parseCsv(csv)) };
    }
  }
}

export class AggregateNode extends BaseNode {
  static readonly nodeType = "nodetool.data.Aggregate";
  static readonly title = "Aggregate";
  static readonly description =
    "Aggregate dataframe by one or more columns.\n    aggregate, groupby, group, sum, mean, count, min, max, std, var, median, first, last\n\n    Use cases:\n    - Prepare data for aggregation operations\n    - Analyze data by categories\n    - Create summary statistics by groups";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Dataframe",
    description: "The DataFrame to group."
  })
  declare dataframe: any;

  @prop({
    type: "str",
    default: "",
    title: "Columns",
    description: "Comma-separated column names to group by."
  })
  declare columns: any;

  @prop({
    type: "str",
    default: "sum",
    title: "Aggregation",
    description:
      "Aggregation function: sum, mean, count, min, max, std, var, median, first, last"
  })
  declare aggregation: any;

  async process(): Promise<Record<string, unknown>> {
    const rows = asRows(this.dataframe ?? this.dataframe);
    const groupCols = String(this.columns ?? this.columns ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const agg = String(this.aggregation ?? this.aggregation ?? "sum");

    const groups = new Map<string, Row[]>();
    for (const row of rows) {
      const keyObj = Object.fromEntries(groupCols.map((c) => [c, row[c]]));
      const key = JSON.stringify(keyObj);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    const output: Row[] = [];
    for (const [key, items] of groups) {
      const base = JSON.parse(key) as Row;
      const numericCols = [...new Set(items.flatMap((r) => Object.keys(r)))]
        .filter((c) => !groupCols.includes(c))
        .filter((c) => items.some((r) => Number.isFinite(toNumber(r[c]))));
      for (const col of numericCols) {
        const values = items
          .map((r) => toNumber(r[col]))
          .filter((n) => Number.isFinite(n));
        if (values.length === 0) continue;
        if (agg === "sum") base[col] = sum(values);
        else if (agg === "mean") base[col] = mean(values);
        else if (agg === "count") base[col] = values.length;
        else if (agg === "min") base[col] = Math.min(...values);
        else if (agg === "max") base[col] = Math.max(...values);
        else if (agg === "std") {
          const m = mean(values);
          const variance =
            values.length > 1
              ? values.reduce((s, v) => s + (v - m) ** 2, 0) /
                (values.length - 1)
              : 0;
          base[col] = Math.sqrt(variance);
        } else if (agg === "var") {
          const m = mean(values);
          base[col] =
            values.length > 1
              ? values.reduce((s, v) => s + (v - m) ** 2, 0) /
                (values.length - 1)
              : 0;
        } else if (agg === "median") base[col] = median(values);
        else if (agg === "first") base[col] = values[0];
        else if (agg === "last") base[col] = values[values.length - 1];
        else throw new Error(`Unknown aggregation function: ${agg}`);
      }
      output.push(base);
    }
    return { output: toDataframe(output) };
  }
}

export class PivotNode extends BaseNode {
  static readonly nodeType = "nodetool.data.Pivot";
  static readonly title = "Pivot";
  static readonly description =
    "Pivot dataframe to reshape data.\n    pivot, reshape, transform\n\n    Use cases:\n    - Transform long data to wide format\n    - Create cross-tabulation tables\n    - Reorganize data for visualization";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Dataframe",
    description: "The DataFrame to pivot."
  })
  declare dataframe: any;

  @prop({
    type: "str",
    default: "",
    title: "Index",
    description: "Column name to use as index (rows)."
  })
  declare index: any;

  @prop({
    type: "str",
    default: "",
    title: "Columns",
    description: "Column name to use as columns."
  })
  declare columns: any;

  @prop({
    type: "str",
    default: "",
    title: "Values",
    description: "Column name to use as values."
  })
  declare values: any;

  @prop({
    type: "str",
    default: "sum",
    title: "Aggfunc",
    description: "Aggregation function: sum, mean, count, min, max, first, last"
  })
  declare aggfunc: any;

  async process(): Promise<Record<string, unknown>> {
    const rows = asRows(this.dataframe ?? this.dataframe);
    const indexCol = String(this.index ?? this.index ?? "");
    const colCol = String(this.columns ?? this.columns ?? "");
    const valCol = String(this.values ?? this.values ?? "");
    const agg = String(this.aggfunc ?? this.aggfunc ?? "sum");

    const groups = new Map<unknown, Map<unknown, number[]>>();
    for (const row of rows) {
      const idx = row[indexCol];
      const col = row[colCol];
      const val = toNumber(row[valCol]);
      if (!Number.isFinite(val)) continue;
      if (!groups.has(idx)) groups.set(idx, new Map());
      const sub = groups.get(idx)!;
      if (!sub.has(col)) sub.set(col, []);
      sub.get(col)!.push(val);
    }

    const out: Row[] = [];
    for (const [idx, cols] of groups) {
      const row: Row = { [indexCol]: idx };
      for (const [col, values] of cols) {
        if (agg === "sum") row[String(col)] = sum(values);
        else if (agg === "mean") row[String(col)] = mean(values);
        else if (agg === "count") row[String(col)] = values.length;
        else if (agg === "min") row[String(col)] = Math.min(...values);
        else if (agg === "max") row[String(col)] = Math.max(...values);
        else if (agg === "first") row[String(col)] = values[0];
        else if (agg === "last") row[String(col)] = values[values.length - 1];
        else throw new Error(`Unknown aggregation function: ${agg}`);
      }
      out.push(row);
    }
    return { output: toDataframe(out) };
  }
}

export class RenameNode extends BaseNode {
  static readonly nodeType = "nodetool.data.Rename";
  static readonly title = "Rename";
  static readonly description =
    "Rename columns in dataframe.\n    rename, columns, names\n\n    Use cases:\n    - Standardize column names\n    - Make column names more descriptive\n    - Prepare data for specific requirements";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Dataframe",
    description: "The DataFrame to rename columns."
  })
  declare dataframe: any;

  @prop({
    type: "str",
    default: "",
    title: "Rename Map",
    description: "Column rename mapping in format: old1:new1,old2:new2"
  })
  declare rename_map: any;

  async process(): Promise<Record<string, unknown>> {
    const rows = asRows(this.dataframe ?? this.dataframe);
    const mapString = String(this.rename_map ?? this.rename_map ?? "");
    const rename = new Map<string, string>();
    for (const pair of mapString.split(",")) {
      if (!pair.includes(":")) continue;
      const [a, b] = pair.split(":", 2).map((s) => s.trim());
      if (a) rename.set(a, b);
    }
    const out = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [rename.get(k) ?? k, v])
      )
    );
    return { output: toDataframe(out) };
  }
}

export class FillNANode extends BaseNode {
  static readonly nodeType = "nodetool.data.FillNA";
  static readonly title = "Fill NA";
  static readonly description =
    "Fill missing values in dataframe.\n    fillna, missing, impute\n\n    Use cases:\n    - Handle missing data\n    - Prepare data for analysis\n    - Improve data quality";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Dataframe",
    description: "The DataFrame with missing values."
  })
  declare dataframe: any;

  @prop({
    type: "any",
    default: 0,
    title: "Value",
    description: "Value to use for filling missing values."
  })
  declare value: any;

  @prop({
    type: "str",
    default: "value",
    title: "Method",
    description: "Method for filling: value, forward, backward, mean, median"
  })
  declare method: any;

  @prop({
    type: "str",
    default: "",
    title: "Columns",
    description:
      "Comma-separated column names to fill. Leave empty for all columns."
  })
  declare columns: any;

  async process(): Promise<Record<string, unknown>> {
    const rows = asRows(this.dataframe ?? this.dataframe);
    const value = this.value ?? this.value ?? 0;
    const method = String(this.method ?? this.method ?? "value");
    const colsRaw = String(this.columns ?? this.columns ?? "");
    const allCols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const cols = colsRaw
      ? colsRaw
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      : allCols;

    const out = rows.map((r) => ({ ...r }));

    if (method === "value") {
      for (const row of out) {
        for (const col of cols) {
          if (row[col] == null || row[col] === "") row[col] = value;
        }
      }
      return { output: toDataframe(out) };
    }

    if (method === "forward" || method === "backward") {
      for (const col of cols) {
        if (method === "forward") {
          let last: unknown = null;
          for (const row of out) {
            if (row[col] == null || row[col] === "") row[col] = last;
            else last = row[col];
          }
        } else {
          let next: unknown = null;
          for (let i = out.length - 1; i >= 0; i -= 1) {
            const row = out[i];
            if (row[col] == null || row[col] === "") row[col] = next;
            else next = row[col];
          }
        }
      }
      return { output: toDataframe(out) };
    }

    if (method === "mean" || method === "median") {
      for (const col of cols) {
        const nums = out
          .map((r) => toNumber(r[col]))
          .filter((n) => Number.isFinite(n));
        const fill = method === "mean" ? mean(nums) : median(nums);
        if (!Number.isFinite(fill)) continue;
        for (const row of out) {
          if (row[col] == null || row[col] === "") row[col] = fill;
        }
      }
      return { output: toDataframe(out) };
    }

    throw new Error(`Unknown fill method: ${method}`);
  }
}

export class SaveCSVDataframeFileNode extends BaseNode {
  static readonly nodeType = "nodetool.data.SaveCSVDataframeFile";
  static readonly title = "Save CSVDataframe File";
  static readonly description =
    "Write a pandas DataFrame to a CSV file.\n    files, csv, write, output, save, file\n\n    The filename can include time and date variables:\n    %Y - Year, %m - Month, %d - Day\n    %H - Hour, %M - Minute, %S - Second";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Dataframe",
    description: "DataFrame to write to CSV"
  })
  declare dataframe: any;

  @prop({
    type: "str",
    default: "",
    title: "Folder",
    description: "Folder where the file will be saved"
  })
  declare folder: any;

  @prop({
    type: "str",
    default: "",
    title: "Filename",
    description: "Name of the CSV file to save. Supports strftime format codes."
  })
  declare filename: any;

  async process(): Promise<Record<string, unknown>> {
    const rows = asRows(this.dataframe ?? this.dataframe);
    const folder = String(this.folder ?? this.folder ?? "");
    const filenameRaw = String(this.filename ?? this.filename ?? "");
    if (!folder) throw new Error("folder cannot be empty");
    if (!filenameRaw) throw new Error("filename cannot be empty");
    const filename = dateName(filenameRaw);
    const full = path.resolve(folder, filename);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, toCsv(rows), "utf8");
    return { output: toDataframe(rows), path: full };
  }
}

export class FilterNoneNode extends BaseNode {
  static readonly nodeType = "nodetool.data.FilterNone";
  static readonly title = "Filter None";
  static readonly description =
    "Filters out None values from a stream.\n    filter, none, null, stream\n\n    Use cases:\n    - Clean data by removing null values\n    - Get only valid entries\n    - Remove placeholder values";
  static readonly metadataOutputTypes = {
    output: "any"
  };

  static readonly isStreamingInput = true;
  static readonly isStreamingOutput = true;
  @prop({
    type: "any",
    default: [],
    title: "Value",
    description: "Input stream"
  })
  declare value: any;

  async process(): Promise<Record<string, unknown>> {
    const value = this.value ?? this.value ?? null;
    if (value == null) {
      return {};
    }
    return { output: value };
  }
}

export class DescribeNode extends BaseNode {
  static readonly nodeType = "nodetool.data.Describe";
  static readonly title = "Describe";
  static readonly description =
    "Compute summary statistics for each numeric column: count, mean, std, min, 25%, 50%, 75%, max.\n    dataframe, statistics, describe, summary, stats, mean, std, min, max, quartile";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };

  @prop({
    type: "dataframe",
    default: { rows: [] },
    title: "Dataframe",
    description: "The dataframe to describe."
  })
  declare dataframe: any;

  async process(): Promise<Record<string, unknown>> {
    const rows = asRows(this.dataframe);
    if (rows.length === 0) return { output: toDataframe([]) };

    const allKeys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const numericCols = allKeys.filter((key) => {
      const vals = rows.map((r) => r[key]).filter((v) => v != null && v !== "");
      return vals.length > 0 && vals.every((v) => !Number.isNaN(Number(v)));
    });

    const statNames = ["count", "mean", "std", "min", "25%", "50%", "75%", "max"];
    const result: Row[] = statNames.map((stat) => {
      const row: Row = { stat };
      for (const col of numericCols) {
        const values = rows
          .map((r) => Number(r[col]))
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => a - b);
        const n = values.length;
        const s = sum(values);
        const m = n > 0 ? s / n : 0;
        const variance = n > 1 ? values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (n - 1) : 0;

        const percentile = (p: number): number => {
          if (n === 0) return 0;
          if (n === 1) return values[0];
          const idx = (p / 100) * (n - 1);
          const lo = Math.floor(idx);
          const hi = Math.ceil(idx);
          if (lo === hi) return values[lo];
          return values[lo] + (values[hi] - values[lo]) * (idx - lo);
        };

        const round4 = (v: number): number => Math.round(v * 10000) / 10000;

        switch (stat) {
          case "count": row[col] = n; break;
          case "mean": row[col] = round4(m); break;
          case "std": row[col] = round4(Math.sqrt(variance)); break;
          case "min": row[col] = n > 0 ? values[0] : 0; break;
          case "25%": row[col] = round4(percentile(25)); break;
          case "50%": row[col] = round4(percentile(50)); break;
          case "75%": row[col] = round4(percentile(75)); break;
          case "max": row[col] = n > 0 ? values[n - 1] : 0; break;
        }
      }
      return row;
    });

    return { output: toDataframe(result) };
  }
}

export const DATA_NODES = [
  SchemaNode,
  FilterDataframeNode,
  SliceDataframeNode,
  SaveDataframeNode,
  ImportCSVNode,
  LoadCSVURLNode,
  LoadCSVFileDataNode,
  FromListNode,
  JSONToDataframeNode,
  ToListNode,
  SelectColumnNode,
  ExtractColumnNode,
  AddColumnNode,
  MergeDataframeNode,
  AppendDataframeNode,
  JoinDataframeNode,
  RowIteratorNode,
  FindRowNode,
  SortByColumnNode,
  DropDuplicatesNode,
  DropNANode,
  ForEachRowNode,
  LoadCSVAssetsNode,
  AggregateNode,
  PivotNode,
  RenameNode,
  FillNANode,
  SaveCSVDataframeFileNode,
  FilterNoneNode,
  DescribeNode
] as const;
