// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// If — nodetool.control.If
export type IfInputs = {
  condition?: Connectable<boolean>;
  value?: Connectable<unknown>;
};

export interface IfOutputs {
  if_true: unknown;
  if_false: unknown;
}

export function if_(inputs: IfInputs): DslNode<IfOutputs> {
  return createNode("nodetool.control.If", inputs, { outputNames: ["if_true", "if_false"], streaming: true });
}

// For Each — nodetool.control.ForEach
export type ForEachInputs = {
  input_list?: Connectable<unknown[]>;
  limit?: Connectable<number>;
};

export interface ForEachOutputs {
  output: unknown;
  index: number;
}

export function forEach(inputs: ForEachInputs): DslNode<ForEachOutputs> {
  return createNode("nodetool.control.ForEach", inputs, { outputNames: ["output", "index"], streaming: true });
}

// Asset Collection — nodetool.control.Collection
export type CollectionInputs = {
  items?: Connectable<unknown[]>;
};

export interface CollectionOutputs {
  output: unknown;
  index: number;
}

export function collection(inputs: CollectionInputs): DslNode<CollectionOutputs> {
  return createNode("nodetool.control.Collection", inputs, { outputNames: ["output", "index"], streaming: true });
}

// Repeat Count — nodetool.control.RepeatCount
export type RepeatCountInputs = {
  count?: Connectable<number>;
};

export interface RepeatCountOutputs {
  output: number;
  index: number;
}

export function repeatCount(inputs: RepeatCountInputs): DslNode<RepeatCountOutputs> {
  return createNode("nodetool.control.RepeatCount", inputs, { outputNames: ["output", "index"], streaming: true });
}

// Repeat Value — nodetool.control.RepeatValue
export type RepeatValueInputs = {
  value?: Connectable<unknown>;
  count?: Connectable<number>;
};

export interface RepeatValueOutputs {
  output: unknown;
  index: number;
}

export function repeatValue(inputs: RepeatValueInputs): DslNode<RepeatValueOutputs> {
  return createNode("nodetool.control.RepeatValue", inputs, { outputNames: ["output", "index"], streaming: true });
}

// Take — nodetool.control.Take
export type TakeInputs = {
  input_item?: Connectable<unknown>;
  n?: Connectable<number>;
};

export interface TakeOutputs {
  output: unknown;
  index: number;
}

export function take(inputs: TakeInputs): DslNode<TakeOutputs> {
  return createNode("nodetool.control.Take", inputs, { outputNames: ["output", "index"], streaming: true, streamingInput: true });
}

// Drop — nodetool.control.Drop
export type DropInputs = {
  input_item?: Connectable<unknown>;
  n?: Connectable<number>;
};

export interface DropOutputs {
  output: unknown;
  index: number;
}

export function drop(inputs: DropInputs): DslNode<DropOutputs> {
  return createNode("nodetool.control.Drop", inputs, { outputNames: ["output", "index"], streaming: true, streamingInput: true });
}

// Take While — nodetool.control.TakeWhile
export type TakeWhileInputs = {
  input_item?: Connectable<unknown>;
  predicate?: Connectable<string>;
};

export interface TakeWhileOutputs {
  output: unknown;
}

export function takeWhile(inputs: TakeWhileInputs): DslNode<TakeWhileOutputs, "output"> {
  return createNode("nodetool.control.TakeWhile", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true, streamingInput: true });
}

// Drop While — nodetool.control.DropWhile
export type DropWhileInputs = {
  input_item?: Connectable<unknown>;
  predicate?: Connectable<string>;
};

export interface DropWhileOutputs {
  output: unknown;
}

export function dropWhile(inputs: DropWhileInputs): DslNode<DropWhileOutputs, "output"> {
  return createNode("nodetool.control.DropWhile", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true, streamingInput: true });
}

// Filter Equal — nodetool.control.FilterEqual
export type FilterEqualInputs = {
  input_item?: Connectable<unknown>;
  value?: Connectable<unknown>;
  invert?: Connectable<boolean>;
};

export interface FilterEqualOutputs {
  output: unknown;
}

export function filterEqual(inputs: FilterEqualInputs): DslNode<FilterEqualOutputs, "output"> {
  return createNode("nodetool.control.FilterEqual", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true, streamingInput: true });
}

// Filter (Expression) — nodetool.control.FilterCode
export type FilterCodeInputs = {
  input_item?: Connectable<unknown>;
  predicate?: Connectable<string>;
};

export interface FilterCodeOutputs {
  output: unknown;
}

export function filterCode(inputs: FilterCodeInputs): DslNode<FilterCodeOutputs, "output"> {
  return createNode("nodetool.control.FilterCode", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true, streamingInput: true });
}

// Chunk — nodetool.control.Chunk
export type ChunkInputs = {
  input_item?: Connectable<unknown>;
  size?: Connectable<number>;
};

export interface ChunkOutputs {
  output: unknown[];
  index: number;
}

export function chunk(inputs: ChunkInputs): DslNode<ChunkOutputs> {
  return createNode("nodetool.control.Chunk", inputs, { outputNames: ["output", "index"], streaming: true, streamingInput: true });
}

// Last — nodetool.control.Last
export type LastInputs = {
  input_item?: Connectable<unknown>;
};

export interface LastOutputs {
  output: unknown;
}

export function last(inputs: LastInputs): DslNode<LastOutputs, "output"> {
  return createNode("nodetool.control.Last", inputs, { outputNames: ["output"], defaultOutput: "output", streamingInput: true });
}

// Count — nodetool.control.Count
export type CountInputs = {
  input_item?: Connectable<unknown>;
};

export interface CountOutputs {
  output: number;
}

export function count(inputs: CountInputs): DslNode<CountOutputs, "output"> {
  return createNode("nodetool.control.Count", inputs, { outputNames: ["output"], defaultOutput: "output", streamingInput: true });
}

// Distinct — nodetool.control.Distinct
export type DistinctInputs = {
  input_item?: Connectable<unknown>;
  key?: Connectable<string>;
};

export interface DistinctOutputs {
  output: unknown;
}

export function distinct(inputs: DistinctInputs): DslNode<DistinctOutputs, "output"> {
  return createNode("nodetool.control.Distinct", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true, streamingInput: true });
}

// Tap — nodetool.control.Tap
export type TapInputs = {
  input_item?: Connectable<unknown>;
  label?: Connectable<string>;
};

export interface TapOutputs {
  output: unknown;
}

export function tap(inputs: TapInputs): DslNode<TapOutputs, "output"> {
  return createNode("nodetool.control.Tap", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true, streamingInput: true });
}

// Collect — nodetool.control.Collect
export type CollectInputs = {
  input_item?: Connectable<unknown>;
};

export interface CollectOutputs {
  output: unknown[];
}

export function collect(inputs: CollectInputs): DslNode<CollectOutputs, "output"> {
  return createNode("nodetool.control.Collect", inputs, { outputNames: ["output"], defaultOutput: "output", streamingInput: true });
}

// Reroute — nodetool.control.Reroute
export type RerouteInputs = {
  input_value?: Connectable<unknown>;
};

export interface RerouteOutputs {
  output: unknown;
}

export function reroute(inputs: RerouteInputs): DslNode<RerouteOutputs, "output"> {
  return createNode("nodetool.control.Reroute", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true });
}

// Switch — nodetool.control.Switch
export type SwitchInputs = {
  value?: Connectable<unknown>;
  cases?: Connectable<unknown[]>;
  input?: Connectable<unknown>;
};

export interface SwitchOutputs {
  matched: unknown;
  default: unknown;
  index: number;
}

export function switch_(inputs: SwitchInputs): DslNode<SwitchOutputs> {
  return createNode("nodetool.control.Switch", inputs, { outputNames: ["matched", "default", "index"], streaming: true });
}

// Fallback — nodetool.control.TryCatch
export type TryCatchInputs = {
  value?: Connectable<unknown>;
  fallback?: Connectable<unknown>;
};

export interface TryCatchOutputs {
  output: unknown;
  error: string;
  has_error: boolean;
}

export function tryCatch(inputs: TryCatchInputs): DslNode<TryCatchOutputs> {
  return createNode("nodetool.control.TryCatch", inputs, { outputNames: ["output", "error", "has_error"], streaming: true });
}

// Zip — nodetool.control.Zip
export type ZipInputs = {
  left?: Connectable<unknown>;
  right?: Connectable<unknown>;
  max_unmatched_pairs?: Connectable<number>;
};

export interface ZipOutputs {
  left: unknown;
  right: unknown;
  index: number;
}

export function zip(inputs: ZipInputs): DslNode<ZipOutputs> {
  return createNode("nodetool.control.Zip", inputs, { outputNames: ["left", "right", "index"], streaming: true, streamingInput: true });
}

// Cross — nodetool.control.Cross
export type CrossInputs = {
  left?: Connectable<unknown>;
  right?: Connectable<unknown>;
  max_output_count?: Connectable<number>;
};

export interface CrossOutputs {
  left: unknown;
  right: unknown;
}

export function cross(inputs: CrossInputs): DslNode<CrossOutputs> {
  return createNode("nodetool.control.Cross", inputs, { outputNames: ["left", "right"], streaming: true, streamingInput: true });
}
