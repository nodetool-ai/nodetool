// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";
import type { DataframeRef, FolderRef } from "../types.js";

// Schema — nodetool.data.Schema
export interface SchemaInputs {
  columns?: Connectable<unknown>;
}

export function schema(inputs: SchemaInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.data.Schema", inputs as Record<string, unknown>);
}

// Filter — nodetool.data.Filter
export interface FilterInputs {
  df?: Connectable<DataframeRef>;
  condition?: Connectable<string>;
}

export function filter(inputs: FilterInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.Filter", inputs as Record<string, unknown>);
}

// Slice — nodetool.data.Slice
export interface SliceInputs {
  dataframe?: Connectable<DataframeRef>;
  start_index?: Connectable<number>;
  end_index?: Connectable<number>;
}

export function slice(inputs: SliceInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.Slice", inputs as Record<string, unknown>);
}

// Save Dataframe — nodetool.data.SaveDataframe
export interface SaveDataframeInputs {
  df?: Connectable<DataframeRef>;
  folder?: Connectable<FolderRef>;
  name?: Connectable<string>;
}

export function saveDataframe(inputs: SaveDataframeInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.SaveDataframe", inputs as Record<string, unknown>);
}

// Import CSV — nodetool.data.ImportCSV
export interface ImportCSVInputs {
  csv_data?: Connectable<string>;
}

export function importCSV(inputs: ImportCSVInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.ImportCSV", inputs as Record<string, unknown>);
}

// Load CSVURL — nodetool.data.LoadCSVURL
export interface LoadCSVURLInputs {
  url?: Connectable<string>;
}

export function loadCSVURL(inputs: LoadCSVURLInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.LoadCSVURL", inputs as Record<string, unknown>);
}

// Load CSVFile — nodetool.data.LoadCSVFile
export interface LoadCSVFileInputs {
  file_path?: Connectable<string>;
}

export function loadCSVFile(inputs: LoadCSVFileInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.LoadCSVFile", inputs as Record<string, unknown>);
}

// From List — nodetool.data.FromList
export interface FromListInputs {
  values?: Connectable<unknown[]>;
}

export function fromList(inputs: FromListInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.FromList", inputs as Record<string, unknown>);
}

// Convert JSON to DataFrame — nodetool.data.JSONToDataframe
export interface JSONToDataframeInputs {
  text?: Connectable<string>;
}

export function jSONToDataframe(inputs: JSONToDataframeInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.JSONToDataframe", inputs as Record<string, unknown>);
}

// To List — nodetool.data.ToList
export interface ToListInputs {
  dataframe?: Connectable<DataframeRef>;
}

export function toList(inputs: ToListInputs): DslNode<SingleOutput<Record<string, unknown>[]>> {
  return createNode("nodetool.data.ToList", inputs as Record<string, unknown>);
}

// Select Column — nodetool.data.SelectColumn
export interface SelectColumnInputs {
  dataframe?: Connectable<DataframeRef>;
  columns?: Connectable<string>;
}

export function selectColumn(inputs: SelectColumnInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.SelectColumn", inputs as Record<string, unknown>);
}

// Extract Column — nodetool.data.ExtractColumn
export interface ExtractColumnInputs {
  dataframe?: Connectable<DataframeRef>;
  column_name?: Connectable<string>;
}

export function extractColumn(inputs: ExtractColumnInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("nodetool.data.ExtractColumn", inputs as Record<string, unknown>);
}

// Add Column — nodetool.data.AddColumn
export interface AddColumnInputs {
  dataframe?: Connectable<DataframeRef>;
  column_name?: Connectable<string>;
  values?: Connectable<unknown[]>;
}

export function addColumn(inputs: AddColumnInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.AddColumn", inputs as Record<string, unknown>);
}

// Merge — nodetool.data.Merge
export interface MergeInputs {
  dataframe_a?: Connectable<DataframeRef>;
  dataframe_b?: Connectable<DataframeRef>;
}

export function merge(inputs: MergeInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.Merge", inputs as Record<string, unknown>);
}

// Append — nodetool.data.Append
export interface AppendInputs {
  dataframe_a?: Connectable<DataframeRef>;
  dataframe_b?: Connectable<DataframeRef>;
}

export function append(inputs: AppendInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.Append", inputs as Record<string, unknown>);
}

// Join — nodetool.data.Join
export interface JoinInputs {
  dataframe_a?: Connectable<DataframeRef>;
  dataframe_b?: Connectable<DataframeRef>;
  join_on?: Connectable<string>;
}

export function join(inputs: JoinInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.Join", inputs as Record<string, unknown>);
}

// Row Iterator — nodetool.data.RowIterator
export interface RowIteratorInputs {
  dataframe?: Connectable<DataframeRef>;
}

export interface RowIteratorOutputs {
  dict: OutputHandle<Record<string, unknown>>;
  index: OutputHandle<unknown>;
}

export function rowIterator(inputs: RowIteratorInputs): DslNode<RowIteratorOutputs> {
  return createNode("nodetool.data.RowIterator", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Find Row — nodetool.data.FindRow
export interface FindRowInputs {
  df?: Connectable<DataframeRef>;
  condition?: Connectable<string>;
}

export function findRow(inputs: FindRowInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.FindRow", inputs as Record<string, unknown>);
}

// Sort By Column — nodetool.data.SortByColumn
export interface SortByColumnInputs {
  df?: Connectable<DataframeRef>;
  column?: Connectable<string>;
}

export function sortByColumn(inputs: SortByColumnInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.SortByColumn", inputs as Record<string, unknown>);
}

// Drop Duplicates — nodetool.data.DropDuplicates
export interface DropDuplicatesInputs {
  df?: Connectable<DataframeRef>;
}

export function dropDuplicates(inputs: DropDuplicatesInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.DropDuplicates", inputs as Record<string, unknown>);
}

// Drop NA — nodetool.data.DropNA
export interface DropNAInputs {
  df?: Connectable<DataframeRef>;
}

export function dropNA(inputs: DropNAInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.DropNA", inputs as Record<string, unknown>);
}

// For Each Row — nodetool.data.ForEachRow
export interface ForEachRowInputs {
  dataframe?: Connectable<DataframeRef>;
}

export interface ForEachRowOutputs {
  row: OutputHandle<Record<string, unknown>>;
  index: OutputHandle<unknown>;
}

export function forEachRow(inputs: ForEachRowInputs): DslNode<ForEachRowOutputs> {
  return createNode("nodetool.data.ForEachRow", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Load CSV Assets — nodetool.data.LoadCSVAssets
export interface LoadCSVAssetsInputs {
  folder?: Connectable<FolderRef>;
}

export interface LoadCSVAssetsOutputs {
  dataframe: OutputHandle<DataframeRef>;
  name: OutputHandle<string>;
}

export function loadCSVAssets(inputs: LoadCSVAssetsInputs): DslNode<LoadCSVAssetsOutputs> {
  return createNode("nodetool.data.LoadCSVAssets", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Aggregate — nodetool.data.Aggregate
export interface AggregateInputs {
  dataframe?: Connectable<DataframeRef>;
  columns?: Connectable<string>;
  aggregation?: Connectable<string>;
}

export function aggregate(inputs: AggregateInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.Aggregate", inputs as Record<string, unknown>);
}

// Pivot — nodetool.data.Pivot
export interface PivotInputs {
  dataframe?: Connectable<DataframeRef>;
  index?: Connectable<string>;
  columns?: Connectable<string>;
  values?: Connectable<string>;
  aggfunc?: Connectable<string>;
}

export function pivot(inputs: PivotInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.Pivot", inputs as Record<string, unknown>);
}

// Rename — nodetool.data.Rename
export interface RenameInputs {
  dataframe?: Connectable<DataframeRef>;
  rename_map?: Connectable<string>;
}

export function rename(inputs: RenameInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.Rename", inputs as Record<string, unknown>);
}

// Fill NA — nodetool.data.FillNA
export interface FillNAInputs {
  dataframe?: Connectable<DataframeRef>;
  value?: Connectable<unknown>;
  method?: Connectable<string>;
  columns?: Connectable<string>;
}

export function fillNA(inputs: FillNAInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.FillNA", inputs as Record<string, unknown>);
}

// Save CSVDataframe File — nodetool.data.SaveCSVDataframeFile
export interface SaveCSVDataframeFileInputs {
  dataframe?: Connectable<DataframeRef>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
}

export function saveCSVDataframeFile(inputs: SaveCSVDataframeFileInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.data.SaveCSVDataframeFile", inputs as Record<string, unknown>);
}

// Filter None — nodetool.data.FilterNone
export interface FilterNoneInputs {
  value?: Connectable<unknown>;
}

export function filterNone(inputs: FilterNoneInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.data.FilterNone", inputs as Record<string, unknown>, { streaming: true });
}
