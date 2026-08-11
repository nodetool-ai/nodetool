// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { DataframeRef, FolderRef } from "../types.js";

// For Each Row — nodetool.data.ForEachRow
export interface ForEachRowInputs {
  dataframe?: Connectable<DataframeRef>;
}

export interface ForEachRowOutputs {
  row: Record<string, unknown>;
  index: unknown;
}

export function forEachRow(inputs: ForEachRowInputs): DslNode<ForEachRowOutputs> {
  return createNode("nodetool.data.ForEachRow", inputs as Record<string, unknown>, { outputNames: ["row", "index"], streaming: true });
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

export function loadCSVAssets(inputs: LoadCSVAssetsInputs): DslNode<LoadCSVAssetsOutputs> {
  return createNode("nodetool.data.LoadCSVAssets", inputs as Record<string, unknown>, { outputNames: ["dataframe", "name", "dataframes", "names"], streaming: true });
}
