// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { DataframeRef, FolderRef } from "../types.js";

// For Each Row — nodetool.data.ForEachRow
export type ForEachRowInputs = {
  dataframe?: Connectable<DataframeRef>;
};

export interface ForEachRowOutputs {
  row: Record<string, unknown>;
  index: unknown;
}

export function forEachRow(inputs: ForEachRowInputs, options?: NodeOptions): NodeWithOutputs<ForEachRowOutputs> {
  return createNode("nodetool.data.ForEachRow", inputs, { id: options?.id, outputNames: ["row", "index"], outputTypes: {"row":"dict","index":"any"}, streaming: true, inputMode: "buffered", outputCorrelation: {"row":{"kind":"iteration","source":"dataframe","group":"items"},"index":{"kind":"iteration","source":"dataframe","group":"items"}} });
}

// Load CSV Assets — nodetool.data.LoadCSVAssets
export type LoadCSVAssetsInputs = {
  folder?: Connectable<FolderRef>;
};

export interface LoadCSVAssetsOutputs {
  dataframe: DataframeRef;
  name: string;
  dataframes: unknown[];
  names: unknown[];
}

export function loadCSVAssets(inputs: LoadCSVAssetsInputs, options?: NodeOptions): NodeWithOutputs<LoadCSVAssetsOutputs> {
  return createNode("nodetool.data.LoadCSVAssets", inputs, { id: options?.id, outputNames: ["dataframe", "name", "dataframes", "names"], outputTypes: {"dataframe":"dataframe","name":"str","dataframes":"list","names":"list"}, streaming: true, inputMode: "buffered", outputCorrelation: {"dataframe":{"kind":"iteration","source":"folder","group":"items"},"name":{"kind":"iteration","source":"folder","group":"items"},"dataframes":{"kind":"single","source":"folder"},"names":{"kind":"single","source":"folder"}} });
}
