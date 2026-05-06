// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { DataframeRef, FolderRef } from "../types.js";

// Schema — nodetool.data.Schema
export interface SchemaInputs {
  columns?: Connectable<unknown>;
}

export interface SchemaOutputs {
  output: unknown;
}

export function schema(inputs: SchemaInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SchemaOutputs, "output"> {
  return createNode("nodetool.data.Schema", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Filter — nodetool.data.Filter
export interface FilterInputs {
  df?: Connectable<DataframeRef>;
  condition?: Connectable<string>;
}

export interface FilterOutputs {
  output: DataframeRef;
}

export function filter(inputs: FilterInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FilterOutputs, "output"> {
  return createNode("nodetool.data.Filter", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Slice — nodetool.data.Slice
export interface SliceInputs {
  dataframe?: Connectable<DataframeRef>;
  start_index?: Connectable<number>;
  end_index?: Connectable<number>;
}

export interface SliceOutputs {
  output: DataframeRef;
}

export function slice(inputs: SliceInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SliceOutputs, "output"> {
  return createNode("nodetool.data.Slice", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Save Dataframe — nodetool.data.SaveDataframe
export interface SaveDataframeInputs {
  df?: Connectable<DataframeRef>;
  folder?: Connectable<FolderRef>;
  name?: Connectable<string>;
}

export interface SaveDataframeOutputs {
  output: DataframeRef;
}

export function saveDataframe(inputs: SaveDataframeInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SaveDataframeOutputs, "output"> {
  return createNode("nodetool.data.SaveDataframe", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Import CSV — nodetool.data.ImportCSV
export interface ImportCSVInputs {
  csv_data?: Connectable<string>;
}

export interface ImportCSVOutputs {
  output: DataframeRef;
}

export function importCSV(inputs: ImportCSVInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ImportCSVOutputs, "output"> {
  return createNode("nodetool.data.ImportCSV", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Load CSVURL — nodetool.data.LoadCSVURL
export interface LoadCSVURLInputs {
  url?: Connectable<string>;
}

export interface LoadCSVURLOutputs {
  output: DataframeRef;
}

export function loadCSVURL(inputs: LoadCSVURLInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<LoadCSVURLOutputs, "output"> {
  return createNode("nodetool.data.LoadCSVURL", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Load CSVFile — nodetool.data.LoadCSVFile
export interface LoadCSVFileInputs {
  file_path?: Connectable<string>;
}

export interface LoadCSVFileOutputs {
  output: DataframeRef;
}

export function loadCSVFile(inputs: LoadCSVFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<LoadCSVFileOutputs, "output"> {
  return createNode("nodetool.data.LoadCSVFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// From List — nodetool.data.FromList
export interface FromListInputs {
  values?: Connectable<unknown[]>;
}

export interface FromListOutputs {
  output: DataframeRef;
}

export function fromList(inputs: FromListInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FromListOutputs, "output"> {
  return createNode("nodetool.data.FromList", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Convert JSON to DataFrame — nodetool.data.JSONToDataframe
export interface JSONToDataframeInputs {
  text?: Connectable<string>;
}

export interface JSONToDataframeOutputs {
  output: DataframeRef;
}

export function jsonToDataframe(inputs: JSONToDataframeInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<JSONToDataframeOutputs, "output"> {
  return createNode("nodetool.data.JSONToDataframe", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// To List — nodetool.data.ToList
export interface ToListInputs {
  dataframe?: Connectable<DataframeRef>;
}

export interface ToListOutputs {
  output: Record<string, unknown>[];
}

export function toList(inputs: ToListInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ToListOutputs, "output"> {
  return createNode("nodetool.data.ToList", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Select Column — nodetool.data.SelectColumn
export interface SelectColumnInputs {
  dataframe?: Connectable<DataframeRef>;
  columns?: Connectable<string>;
}

export interface SelectColumnOutputs {
  output: DataframeRef;
}

export function selectColumn(inputs: SelectColumnInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SelectColumnOutputs, "output"> {
  return createNode("nodetool.data.SelectColumn", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Extract Column — nodetool.data.ExtractColumn
export interface ExtractColumnInputs {
  dataframe?: Connectable<DataframeRef>;
  column_name?: Connectable<string>;
}

export interface ExtractColumnOutputs {
  output: unknown[];
}

export function extractColumn(inputs: ExtractColumnInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractColumnOutputs, "output"> {
  return createNode("nodetool.data.ExtractColumn", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Add Column — nodetool.data.AddColumn
export interface AddColumnInputs {
  dataframe?: Connectable<DataframeRef>;
  column_name?: Connectable<string>;
  values?: Connectable<unknown[]>;
}

export interface AddColumnOutputs {
  output: DataframeRef;
}

export function addColumn(inputs: AddColumnInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<AddColumnOutputs, "output"> {
  return createNode("nodetool.data.AddColumn", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Merge — nodetool.data.Merge
export interface MergeInputs {
  dataframe_a?: Connectable<DataframeRef>;
  dataframe_b?: Connectable<DataframeRef>;
}

export interface MergeOutputs {
  output: DataframeRef;
}

export function merge(inputs: MergeInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<MergeOutputs, "output"> {
  return createNode("nodetool.data.Merge", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Append — nodetool.data.Append
export interface AppendInputs {
  dataframe_a?: Connectable<DataframeRef>;
  dataframe_b?: Connectable<DataframeRef>;
}

export interface AppendOutputs {
  output: DataframeRef;
}

export function append(inputs: AppendInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<AppendOutputs, "output"> {
  return createNode("nodetool.data.Append", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Join — nodetool.data.Join
export interface JoinInputs {
  dataframe_a?: Connectable<DataframeRef>;
  dataframe_b?: Connectable<DataframeRef>;
  join_on?: Connectable<string>;
}

export interface JoinOutputs {
  output: DataframeRef;
}

export function join(inputs: JoinInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<JoinOutputs, "output"> {
  return createNode("nodetool.data.Join", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Row Iterator — nodetool.data.RowIterator
export interface RowIteratorInputs {
  dataframe?: Connectable<DataframeRef>;
}

export interface RowIteratorOutputs {
  dict: Record<string, unknown>;
  index: unknown;
}

export function rowIterator(inputs: RowIteratorInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RowIteratorOutputs> {
  return createNode("nodetool.data.RowIterator", inputs as Record<string, unknown>, { outputNames: ["dict", "index"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Find Row — nodetool.data.FindRow
export interface FindRowInputs {
  df?: Connectable<DataframeRef>;
  condition?: Connectable<string>;
}

export interface FindRowOutputs {
  output: DataframeRef;
}

export function findRow(inputs: FindRowInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FindRowOutputs, "output"> {
  return createNode("nodetool.data.FindRow", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Sort By Column — nodetool.data.SortByColumn
export interface SortByColumnInputs {
  df?: Connectable<DataframeRef>;
  column?: Connectable<string>;
}

export interface SortByColumnOutputs {
  output: DataframeRef;
}

export function sortByColumn(inputs: SortByColumnInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SortByColumnOutputs, "output"> {
  return createNode("nodetool.data.SortByColumn", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Drop Duplicates — nodetool.data.DropDuplicates
export interface DropDuplicatesInputs {
  df?: Connectable<DataframeRef>;
}

export interface DropDuplicatesOutputs {
  output: DataframeRef;
}

export function dropDuplicates(inputs: DropDuplicatesInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DropDuplicatesOutputs, "output"> {
  return createNode("nodetool.data.DropDuplicates", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Drop NA — nodetool.data.DropNA
export interface DropNAInputs {
  df?: Connectable<DataframeRef>;
}

export interface DropNAOutputs {
  output: DataframeRef;
}

export function dropNA(inputs: DropNAInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DropNAOutputs, "output"> {
  return createNode("nodetool.data.DropNA", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// For Each Row — nodetool.data.ForEachRow
export interface ForEachRowInputs {
  dataframe?: Connectable<DataframeRef>;
}

export interface ForEachRowOutputs {
  row: Record<string, unknown>;
  index: unknown;
}

export function forEachRow(inputs: ForEachRowInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ForEachRowOutputs> {
  return createNode("nodetool.data.ForEachRow", inputs as Record<string, unknown>, { outputNames: ["row", "index"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Load CSV Assets — nodetool.data.LoadCSVAssets
export interface LoadCSVAssetsInputs {
  folder?: Connectable<FolderRef>;
}

export interface LoadCSVAssetsOutputs {
  dataframe: DataframeRef;
  name: string;
  dataframes: unknown[];
  names: unknown[];
}

export function loadCSVAssets(inputs: LoadCSVAssetsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<LoadCSVAssetsOutputs> {
  return createNode("nodetool.data.LoadCSVAssets", inputs as Record<string, unknown>, { outputNames: ["dataframe", "name", "dataframes", "names"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Aggregate — nodetool.data.Aggregate
export interface AggregateInputs {
  dataframe?: Connectable<DataframeRef>;
  columns?: Connectable<string>;
  aggregation?: Connectable<string>;
}

export interface AggregateOutputs {
  output: DataframeRef;
}

export function aggregate(inputs: AggregateInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<AggregateOutputs, "output"> {
  return createNode("nodetool.data.Aggregate", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Pivot — nodetool.data.Pivot
export interface PivotInputs {
  dataframe?: Connectable<DataframeRef>;
  index?: Connectable<string>;
  columns?: Connectable<string>;
  values?: Connectable<string>;
  aggfunc?: Connectable<string>;
}

export interface PivotOutputs {
  output: DataframeRef;
}

export function pivot(inputs: PivotInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<PivotOutputs, "output"> {
  return createNode("nodetool.data.Pivot", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Rename — nodetool.data.Rename
export interface RenameInputs {
  dataframe?: Connectable<DataframeRef>;
  rename_map?: Connectable<string>;
}

export interface RenameOutputs {
  output: DataframeRef;
}

export function rename(inputs: RenameInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RenameOutputs, "output"> {
  return createNode("nodetool.data.Rename", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Fill NA — nodetool.data.FillNA
export interface FillNAInputs {
  dataframe?: Connectable<DataframeRef>;
  value?: Connectable<unknown>;
  method?: Connectable<string>;
  columns?: Connectable<string>;
}

export interface FillNAOutputs {
  output: DataframeRef;
}

export function fillNA(inputs: FillNAInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FillNAOutputs, "output"> {
  return createNode("nodetool.data.FillNA", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Save CSVDataframe File — nodetool.data.SaveCSVDataframeFile
export interface SaveCSVDataframeFileInputs {
  dataframe?: Connectable<DataframeRef>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
}

export interface SaveCSVDataframeFileOutputs {
  output: DataframeRef;
}

export function saveCSVDataframeFile(inputs: SaveCSVDataframeFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SaveCSVDataframeFileOutputs, "output"> {
  return createNode("nodetool.data.SaveCSVDataframeFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Filter None — nodetool.data.FilterNone
export interface FilterNoneInputs {
  value?: Connectable<unknown>;
}

export interface FilterNoneOutputs {
  output: unknown;
}

export function filterNone(inputs: FilterNoneInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FilterNoneOutputs, "output"> {
  return createNode("nodetool.data.FilterNone", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streaming: true, streamingInput: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Describe — nodetool.data.Describe
export interface DescribeInputs {
  dataframe?: Connectable<DataframeRef>;
}

export interface DescribeOutputs {
  output: DataframeRef;
}

export function describe(inputs: DescribeInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DescribeOutputs, "output"> {
  return createNode("nodetool.data.Describe", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
