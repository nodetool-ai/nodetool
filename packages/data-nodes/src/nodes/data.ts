import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { InputMode, OutputCorrelation, Platform } from "@nodetool-ai/protocol";
import {
  loadNodeFsPromises,
  loadNodePath
} from "@nodetool-ai/nodes-utils";
import Papa from "papaparse";
import { tagAsServer } from "@nodetool-ai/nodes-utils";

const NODE_ONLY: readonly Platform[] = ["node"];

type Row = Record<string, unknown>;

function columnName(col: unknown): string {
  if (col && typeof col === "object" && "name" in col) {
    const name = (col as { name?: unknown }).name;
    if (typeof name === "string") return name;
    return String(name ?? "");
  }
  return String(col);
}

function rowsFromColumnData(columns: unknown[], data: unknown[][]): Row[] {
  const names = columns.map(columnName).filter((name) => name.length > 0);
  if (names.length === 0) return [];

  return data.map((row) => {
    const record: Row = {};
    names.forEach((name, index) => {
      record[name] = row[index] ?? null;
    });
    return record;
  });
}

function isArrayMatrix(data: unknown[]): data is unknown[][] {
  if (data.length === 0) return true;
  return data.every((row) => Array.isArray(row));
}

export function asRows(value: unknown): Row[] {
  if (Array.isArray(value)) {
    return value
      .filter(
        (x): x is Row => !!x && typeof x === "object" && !Array.isArray(x)
      )
      .map((x) => ({ ...x }));
  }
  if (value && typeof value === "object") {
    const obj = value as { rows?: unknown; data?: unknown; columns?: unknown };
    if (Array.isArray(obj.rows)) return asRows(obj.rows);
    if (
      Array.isArray(obj.columns) &&
      Array.isArray(obj.data) &&
      isArrayMatrix(obj.data)
    ) {
      return rowsFromColumnData(obj.columns, obj.data);
    }
    if (Array.isArray(obj.data)) return asRows(obj.data);
  }
  return [];
}

function toDataframe(rows: Row[]) {
  return { rows };
}

function parseCsv(csv: string): Row[] {
  if (!csv) return [];
  const result = Papa.parse<Row>(csv, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim()
  });
  return (result.data ?? []).filter(
    (row): row is Row => !!row && typeof row === "object"
  );
}

/** Output handles ForEachRowNode.genProcess() emits. */
type ForEachRowNodeStreamOutputs = {
  row: Row;
  index: number;
};

export class ForEachRowNode extends BaseNode {
  static readonly nodeType = "nodetool.data.ForEachRow";
  static readonly retrySafe = true;
  static readonly title = "For Each Row";
  static readonly description =
    "Iterate over rows of a dataframe.\n    iterator, loop, dataframe, sequence, rows\n\n    Use cases:\n    - Process each row of a dataframe individually\n    - Trigger actions for every record in a dataset";
  static readonly inlineFields = [];
  static readonly inputFields = ["dataframe"];
  static readonly metadataOutputTypes = {
    row: "dict",
    index: "any"
  };

  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation = {
    row: { kind: "iteration", source: "dataframe", group: "items" },
    index: { kind: "iteration", source: "dataframe", group: "items" }
  } satisfies Record<string, OutputCorrelation>;

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

  async *genProcess(): AsyncGenerator<ForEachRowNodeStreamOutputs> {
    const rows = asRows(this.dataframe);
    for (const [index, row] of rows.entries()) {
      yield { row, index };
    }
  }
}

export class LoadCSVAssetsNode extends BaseNode {
  static readonly nodeType = "nodetool.data.LoadCSVAssets";
  static readonly platforms = NODE_ONLY;
  static readonly title = "Load CSV Assets";
  static readonly description =
    "Load dataframes from an asset folder.\n    load, dataframe, file, import\n\n    Use cases:\n    - Load multiple dataframes from a folder\n    - Process multiple datasets in sequence\n    - Batch import of data files";
  static readonly inlineFields = [];
  static readonly inputFields = ["folder"];
  static readonly metadataOutputTypes = {
    dataframe: "dataframe",
    name: "str",
    dataframes: "list",
    names: "list"
  };

  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation = {
    dataframe: { kind: "iteration", source: "folder", group: "items" },
    name: { kind: "iteration", source: "folder", group: "items" },
    dataframes: { kind: "single", source: "folder" },
    names: { kind: "single", source: "folder" }
  } satisfies Record<string, OutputCorrelation>;

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
    const allDataframes: unknown[] = [];
    const allNames: string[] = [];
    for await (const item of this._collectItems()) {
      allDataframes.push(item.dataframe);
      allNames.push(item.name);
    }
    return {
      dataframe: allDataframes[0] ?? toDataframe([]),
      name: allNames[0] ?? "",
      dataframes: allDataframes,
      names: allNames
    };
  }

  private async *_collectItems(): AsyncGenerator<{
    dataframe: unknown;
    name: string;
  }> {
    const folder = String(this.folder ?? ".");
    const fs = await loadNodeFsPromises();
    const path = await loadNodePath();
    const entries = await fs.readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".csv"))
        continue;
      const full = path.join(folder, entry.name);
      const csv = await fs.readFile(full, "utf8");
      yield { name: entry.name, dataframe: toDataframe(parseCsv(csv)) };
    }
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const allDataframes: unknown[] = [];
    const allNames: string[] = [];
    for await (const item of this._collectItems()) {
      allDataframes.push(item.dataframe);
      allNames.push(item.name);
      yield { name: item.name, dataframe: item.dataframe };
    }
    // Emit collected lists as final output
    yield { dataframes: allDataframes, names: allNames };
  }
}

export const DATA_NODES = tagAsServer([ForEachRowNode, LoadCSVAssetsNode]);
