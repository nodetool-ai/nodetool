// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";
import type { DataframeRef, FolderRef } from "../../types.js";

// For Each Row — nodetool.data.ForEachRow
export type ForEachRowInputs = {
  dataframe?: DataframeRef;
};

export interface ForEachRowOutputs {
  row: Record<string, unknown>;
  index: unknown;
}

export function forEachRow(inputs: ForEachRowInputs): Promise<ForEachRowOutputs> {
  return callNode<ForEachRowOutputs>("nodetool.data.ForEachRow", inputs);
}

forEachRow.stream = function (inputs: ForEachRowInputs): AsyncIterable<Partial<ForEachRowOutputs>> {
  return streamNode<Partial<ForEachRowOutputs>>("nodetool.data.ForEachRow", inputs);
};

// Load CSV Assets — nodetool.data.LoadCSVAssets
export type LoadCSVAssetsInputs = {
  folder?: FolderRef;
};

export interface LoadCSVAssetsOutputs {
  dataframe: DataframeRef;
  name: string;
  dataframes: unknown[];
  names: unknown[];
}

export function loadCSVAssets(inputs: LoadCSVAssetsInputs): Promise<LoadCSVAssetsOutputs> {
  return callNode<LoadCSVAssetsOutputs>("nodetool.data.LoadCSVAssets", inputs);
}

loadCSVAssets.stream = function (inputs: LoadCSVAssetsInputs): AsyncIterable<Partial<LoadCSVAssetsOutputs>> {
  return streamNode<Partial<LoadCSVAssetsOutputs>>("nodetool.data.LoadCSVAssets", inputs);
};
