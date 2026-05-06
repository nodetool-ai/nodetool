// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// If — nodetool.control.If
export interface IfInputs {
  condition?: Connectable<boolean>;
  value?: Connectable<unknown>;
}

export interface IfOutputs {
  if_true: unknown;
  if_false: unknown;
}

export function if_(inputs: IfInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<IfOutputs> {
  return createNode("nodetool.control.If", inputs as Record<string, unknown>, { outputNames: ["if_true", "if_false"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// For Each — nodetool.control.ForEach
export interface ForEachInputs {
  input_list?: Connectable<unknown[]>;
  limit?: Connectable<number>;
}

export interface ForEachOutputs {
  output: unknown;
  index: number;
}

export function forEach(inputs: ForEachInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ForEachOutputs> {
  return createNode("nodetool.control.ForEach", inputs as Record<string, unknown>, { outputNames: ["output", "index"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Take — nodetool.control.Take
export interface TakeInputs {
  input_item?: Connectable<unknown>;
  n?: Connectable<number>;
}

export interface TakeOutputs {
  output: unknown;
  index: number;
}

export function take(inputs: TakeInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<TakeOutputs> {
  return createNode("nodetool.control.Take", inputs as Record<string, unknown>, { outputNames: ["output", "index"], streaming: true, streamingInput: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Drop — nodetool.control.Drop
export interface DropInputs {
  input_item?: Connectable<unknown>;
  n?: Connectable<number>;
}

export interface DropOutputs {
  output: unknown;
  index: number;
}

export function drop(inputs: DropInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DropOutputs> {
  return createNode("nodetool.control.Drop", inputs as Record<string, unknown>, { outputNames: ["output", "index"], streaming: true, streamingInput: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Take While — nodetool.control.TakeWhile
export interface TakeWhileInputs {
  input_item?: Connectable<unknown>;
  predicate?: Connectable<string>;
}

export interface TakeWhileOutputs {
  output: unknown;
}

export function takeWhile(inputs: TakeWhileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<TakeWhileOutputs, "output"> {
  return createNode("nodetool.control.TakeWhile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streaming: true, streamingInput: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Drop While — nodetool.control.DropWhile
export interface DropWhileInputs {
  input_item?: Connectable<unknown>;
  predicate?: Connectable<string>;
}

export interface DropWhileOutputs {
  output: unknown;
}

export function dropWhile(inputs: DropWhileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DropWhileOutputs, "output"> {
  return createNode("nodetool.control.DropWhile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streaming: true, streamingInput: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Filter Equal — nodetool.control.FilterEqual
export interface FilterEqualInputs {
  input_item?: Connectable<unknown>;
  value?: Connectable<unknown>;
  invert?: Connectable<boolean>;
}

export interface FilterEqualOutputs {
  output: unknown;
}

export function filterEqual(inputs: FilterEqualInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FilterEqualOutputs, "output"> {
  return createNode("nodetool.control.FilterEqual", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streaming: true, streamingInput: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Filter (Code) — nodetool.control.FilterCode
export interface FilterCodeInputs {
  input_item?: Connectable<unknown>;
  predicate?: Connectable<string>;
}

export interface FilterCodeOutputs {
  output: unknown;
}

export function filterCode(inputs: FilterCodeInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FilterCodeOutputs, "output"> {
  return createNode("nodetool.control.FilterCode", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streaming: true, streamingInput: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Chunk — nodetool.control.Chunk
export interface ChunkInputs {
  input_item?: Connectable<unknown>;
  size?: Connectable<number>;
}

export interface ChunkOutputs {
  output: unknown[];
  index: number;
}

export function chunk(inputs: ChunkInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ChunkOutputs> {
  return createNode("nodetool.control.Chunk", inputs as Record<string, unknown>, { outputNames: ["output", "index"], streaming: true, streamingInput: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Last — nodetool.control.Last
export interface LastInputs {
  input_item?: Connectable<unknown>;
}

export interface LastOutputs {
  output: unknown;
}

export function last(inputs: LastInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<LastOutputs, "output"> {
  return createNode("nodetool.control.Last", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streamingInput: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Count — nodetool.control.Count
export interface CountInputs {
  input_item?: Connectable<unknown>;
}

export interface CountOutputs {
  output: number;
}

export function count(inputs: CountInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CountOutputs, "output"> {
  return createNode("nodetool.control.Count", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streamingInput: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Distinct — nodetool.control.Distinct
export interface DistinctInputs {
  input_item?: Connectable<unknown>;
  key?: Connectable<string>;
}

export interface DistinctOutputs {
  output: unknown;
}

export function distinct(inputs: DistinctInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DistinctOutputs, "output"> {
  return createNode("nodetool.control.Distinct", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streaming: true, streamingInput: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Tap — nodetool.control.Tap
export interface TapInputs {
  input_item?: Connectable<unknown>;
  label?: Connectable<string>;
}

export interface TapOutputs {
  output: unknown;
}

export function tap(inputs: TapInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<TapOutputs, "output"> {
  return createNode("nodetool.control.Tap", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streaming: true, streamingInput: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Collect — nodetool.control.Collect
export interface CollectInputs {
  input_item?: Connectable<unknown>;
}

export interface CollectOutputs {
  output: unknown[];
}

export function collect(inputs: CollectInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CollectOutputs, "output"> {
  return createNode("nodetool.control.Collect", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streamingInput: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Reroute — nodetool.control.Reroute
export interface RerouteInputs {
  input_value?: Connectable<unknown>;
}

export interface RerouteOutputs {
  output: unknown;
}

export function reroute(inputs: RerouteInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RerouteOutputs, "output"> {
  return createNode("nodetool.control.Reroute", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Switch — nodetool.control.Switch
export interface SwitchInputs {
  value?: Connectable<unknown>;
  cases?: Connectable<unknown[]>;
  input?: Connectable<unknown>;
}

export interface SwitchOutputs {
  matched: unknown;
  default: unknown;
  index: number;
}

export function switch_(inputs: SwitchInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SwitchOutputs> {
  return createNode("nodetool.control.Switch", inputs as Record<string, unknown>, { outputNames: ["matched", "default", "index"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Try / Catch — nodetool.control.TryCatch
export interface TryCatchInputs {
  value?: Connectable<unknown>;
  fallback?: Connectable<unknown>;
}

export interface TryCatchOutputs {
  output: unknown;
  error: string;
  has_error: boolean;
}

export function tryCatch(inputs: TryCatchInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<TryCatchOutputs> {
  return createNode("nodetool.control.TryCatch", inputs as Record<string, unknown>, { outputNames: ["output", "error", "has_error"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
