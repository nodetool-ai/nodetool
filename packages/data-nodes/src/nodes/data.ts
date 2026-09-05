import { BaseNode, isString, prop } from "@nodetool-ai/node-sdk";
import type {
  ColumnDef,
  FolderRef,
  InputMode,
  OutputCorrelation,
  Platform
} from "@nodetool-ai/protocol";
import {
  loadNodeFsPromises,
  loadNodePath,
  loadNodeUrl
} from "@nodetool-ai/nodes-utils";
import Papa from "papaparse";
import { tagAsServer } from "@nodetool-ai/nodes-utils";

const NODE_ONLY: readonly Platform[] = ["node"];

/**
 * One dataframe cell. CSV parsing yields the scalars; a dataframe another node
 * built can carry nested JSON in a cell, which these nodes pass through
 * untouched.
 */
export type CellValue =
  | string
  | number
  | boolean
  | null
  | CellValue[]
  | { [column: string]: CellValue };

/** A dataframe row keyed by column name. */
export type Row = { [column: string]: CellValue };

/** The `{ rows }` dataframe these nodes emit and {@link asRows} reads back. */
type RowsDataframe = { rows: Row[] };

/**
 * A column header as a dataframe payload carries it: the protocol's `ColumnDef`
 * for a `DataframeRef`, or a bare name for a hand-built `{ columns, data }`.
 */
type ColumnHeader = ColumnDef | string;

/**
 * A dataframe that wraps its rows instead of being an array of them: `{ rows }`
 * from these nodes, or the `{ columns, data }` column matrix a `DataframeRef`
 * carries.
 */
type DataframeEnvelope = {
  rows?: DataframeInput;
  data?: DataframeInput;
  columns?: ColumnHeader[];
};

/** Whatever a `dataframe` property holds by the time it reaches these nodes. */
export type DataframeInput = DataframeEnvelope | CellValue | undefined;

function isRow(value: CellValue): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEnvelope(value: DataframeInput): value is DataframeEnvelope {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isColumnDef(header: ColumnHeader): header is ColumnDef {
  return typeof header === "object" && header !== null && "name" in header;
}

/** `header.name` is untrusted despite `ColumnDef` declaring it a string. */
function columnName(header: ColumnHeader): string {
  return isColumnDef(header) ? String(header.name ?? "") : String(header);
}

function rowsFromColumnData(
  columns: readonly ColumnHeader[],
  data: readonly CellValue[][]
): Row[] {
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

function isArrayMatrix(data: readonly CellValue[]): data is CellValue[][] {
  if (data.length === 0) return true;
  return data.every((row) => Array.isArray(row));
}

export function asRows(value: DataframeInput): Row[] {
  if (Array.isArray(value)) {
    return value.filter(isRow).map((row) => ({ ...row }));
  }
  if (isEnvelope(value)) {
    if (Array.isArray(value.rows)) return asRows(value.rows);
    if (
      Array.isArray(value.columns) &&
      Array.isArray(value.data) &&
      isArrayMatrix(value.data)
    ) {
      return rowsFromColumnData(value.columns, value.data);
    }
    if (Array.isArray(value.data)) return asRows(value.data);
  }
  return [];
}

function toDataframe(rows: Row[]): RowsDataframe {
  return { rows };
}

/**
 * A `folder` prop carries a `FolderRef`, not a path. Its `uri` is the directory
 * to scan; an empty ref (the descriptor default) means the working directory.
 */
async function folderPath(folder: FolderRef | string): Promise<string> {
  const uri = isString(folder) ? folder : (folder?.uri ?? "");
  if (!uri) return ".";
  if (!uri.startsWith("file://")) return uri;
  try {
    const { fileURLToPath } = await loadNodeUrl();
    return fileURLToPath(new URL(uri));
  } catch {
    return uri.slice("file://".length);
  }
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

/** Output handles ForEachRowNode emits — all of them from genProcess(). */
type ForEachRowNodeOutputs = {
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
  declare dataframe: DataframeInput;

  async process(): Promise<Partial<ForEachRowNodeOutputs>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<ForEachRowNodeOutputs> {
    const rows = asRows(this.dataframe);
    for (const [index, row] of rows.entries()) {
      yield { row, index };
    }
  }
}

/** Output handles LoadCSVAssetsNode emits; genProcess() emits them in batches. */
type LoadCSVAssetsNodeOutputs = {
  dataframe: RowsDataframe;
  name: string;
  dataframes: RowsDataframe[];
  names: string[];
};

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
  declare folder: FolderRef | string;

  async process(): Promise<LoadCSVAssetsNodeOutputs> {
    const allDataframes: RowsDataframe[] = [];
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
    dataframe: RowsDataframe;
    name: string;
  }> {
    const folder = await folderPath(this.folder);
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

  async *genProcess(): AsyncGenerator<Partial<LoadCSVAssetsNodeOutputs>> {
    const allDataframes: RowsDataframe[] = [];
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
