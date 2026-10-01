// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// If — nodetool.control.If
export type IfInputs = {
  condition?: Connectable<boolean>;
  value?: Connectable<unknown>;
};

export interface IfOutputs {
  if_true: unknown;
  if_false: unknown;
}

export function if_(inputs: IfInputs, options?: NodeOptions): NodeWithOutputs<IfOutputs> {
  return createNode("nodetool.control.If", inputs, { id: options?.id, outputNames: ["if_true", "if_false"], outputTypes: {"if_true":"any","if_false":"any"}, streaming: true, inputMode: "buffered", outputCorrelation: {"if_true":{"kind":"forward","source":"value"},"if_false":{"kind":"forward","source":"value"}} });
}

// Loop — nodetool.control.Loop
export type LoopInputs = {
  initial?: Connectable<unknown>;
  next?: Connectable<unknown>;
  condition?: Connectable<boolean>;
  max_iterations?: Connectable<number>;
};

export interface LoopOutputs {
  value: unknown;
  index: number;
  done: unknown;
}

export function loop(inputs: LoopInputs, options?: NodeOptions): NodeWithOutputs<LoopOutputs> {
  return createNode("nodetool.control.Loop", inputs, { id: options?.id, outputNames: ["value", "index", "done"], outputTypes: {"value":"any","index":"int","done":"any"}, streaming: true, inputMode: "buffered", outputCorrelation: {"value":{"kind":"iteration","source":"initial","group":"loop"},"index":{"kind":"iteration","source":"initial","group":"loop"},"done":{"kind":"single","source":"initial"}} });
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

export function forEach(inputs: ForEachInputs, options?: NodeOptions): NodeWithOutputs<ForEachOutputs> {
  return createNode("nodetool.control.ForEach", inputs, { id: options?.id, outputNames: ["output", "index"], outputTypes: {"output":"any","index":"int"}, streaming: true, inputMode: "buffered", outputCorrelation: {"output":{"kind":"iteration","source":"__execution__","group":"items"},"index":{"kind":"iteration","source":"__execution__","group":"items"}} });
}

// Asset Collection — nodetool.control.Collection
export type CollectionInputs = {
  items?: Connectable<unknown[]>;
};

export interface CollectionOutputs {
  output: unknown;
  index: number;
}

export function collection(inputs: CollectionInputs, options?: NodeOptions): NodeWithOutputs<CollectionOutputs> {
  return createNode("nodetool.control.Collection", inputs, { id: options?.id, outputNames: ["output", "index"], outputTypes: {"output":"any","index":"int"}, streaming: true, inputMode: "buffered", outputCorrelation: {"output":{"kind":"iteration","source":"__execution__","group":"items"},"index":{"kind":"iteration","source":"__execution__","group":"items"}} });
}

// Repeat Count — nodetool.control.RepeatCount
export type RepeatCountInputs = {
  count?: Connectable<number>;
};

export interface RepeatCountOutputs {
  output: number;
  index: number;
}

export function repeatCount(inputs: RepeatCountInputs, options?: NodeOptions): NodeWithOutputs<RepeatCountOutputs> {
  return createNode("nodetool.control.RepeatCount", inputs, { id: options?.id, outputNames: ["output", "index"], outputTypes: {"output":"int","index":"int"}, streaming: true, inputMode: "buffered", outputCorrelation: {"output":{"kind":"iteration","source":"__execution__","group":"items"},"index":{"kind":"iteration","source":"__execution__","group":"items"}} });
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

export function repeatValue(inputs: RepeatValueInputs, options?: NodeOptions): NodeWithOutputs<RepeatValueOutputs> {
  return createNode("nodetool.control.RepeatValue", inputs, { id: options?.id, outputNames: ["output", "index"], outputTypes: {"output":"any","index":"int"}, streaming: true, inputMode: "buffered", outputCorrelation: {"output":{"kind":"iteration","source":"__execution__","group":"items"},"index":{"kind":"iteration","source":"__execution__","group":"items"}} });
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

export function take(inputs: TakeInputs, options?: NodeOptions): NodeWithOutputs<TakeOutputs> {
  return createNode("nodetool.control.Take", inputs, { id: options?.id, outputNames: ["output", "index"], outputTypes: {"output":"any","index":"int"}, streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: {"output":{"kind":"forward","source":"input_item"},"index":{"kind":"forward","source":"input_item"}} });
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

export function drop(inputs: DropInputs, options?: NodeOptions): NodeWithOutputs<DropOutputs> {
  return createNode("nodetool.control.Drop", inputs, { id: options?.id, outputNames: ["output", "index"], outputTypes: {"output":"any","index":"int"}, streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: {"output":{"kind":"forward","source":"input_item"},"index":{"kind":"forward","source":"input_item"}} });
}

// Take While — nodetool.control.TakeWhile
export type TakeWhileInputs = {
  input_item?: Connectable<unknown>;
  predicate?: Connectable<string>;
};

export interface TakeWhileOutputs {
  output: unknown;
}

export function takeWhile(inputs: TakeWhileInputs, options?: NodeOptions): NodeWithOutputs<TakeWhileOutputs, "output"> {
  return createNode("nodetool.control.TakeWhile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"any"}, defaultOutput: "output", streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: {"output":{"kind":"forward","source":"input_item"}} });
}

// Drop While — nodetool.control.DropWhile
export type DropWhileInputs = {
  input_item?: Connectable<unknown>;
  predicate?: Connectable<string>;
};

export interface DropWhileOutputs {
  output: unknown;
}

export function dropWhile(inputs: DropWhileInputs, options?: NodeOptions): NodeWithOutputs<DropWhileOutputs, "output"> {
  return createNode("nodetool.control.DropWhile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"any"}, defaultOutput: "output", streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: {"output":{"kind":"forward","source":"input_item"}} });
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

export function filterEqual(inputs: FilterEqualInputs, options?: NodeOptions): NodeWithOutputs<FilterEqualOutputs, "output"> {
  return createNode("nodetool.control.FilterEqual", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"any"}, defaultOutput: "output", streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: {"output":{"kind":"forward","source":"input_item"}} });
}

// Filter (Expression) — nodetool.control.FilterCode
export type FilterCodeInputs = {
  input_item?: Connectable<unknown>;
  predicate?: Connectable<string>;
};

export interface FilterCodeOutputs {
  output: unknown;
}

export function filterCode(inputs: FilterCodeInputs, options?: NodeOptions): NodeWithOutputs<FilterCodeOutputs, "output"> {
  return createNode("nodetool.control.FilterCode", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"any"}, defaultOutput: "output", streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: {"output":{"kind":"forward","source":"input_item"}} });
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

export function chunk(inputs: ChunkInputs, options?: NodeOptions): NodeWithOutputs<ChunkOutputs> {
  return createNode("nodetool.control.Chunk", inputs, { id: options?.id, outputNames: ["output", "index"], outputTypes: {"output":"list[any]","index":"int"}, streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: {"output":{"kind":"iteration","source":"input_item","group":"batch"},"index":{"kind":"iteration","source":"input_item","group":"batch"}} });
}

// Last — nodetool.control.Last
export type LastInputs = {
  input_item?: Connectable<unknown>;
};

export interface LastOutputs {
  output: unknown;
}

export function last(inputs: LastInputs, options?: NodeOptions): NodeWithOutputs<LastOutputs, "output"> {
  return createNode("nodetool.control.Last", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"any"}, defaultOutput: "output", streamingInput: true, inputMode: "stream", outputCorrelation: {"output":{"kind":"aggregate","source":"input_item","collapse":"innermost"}} });
}

// Count — nodetool.control.Count
export type CountInputs = {
  input_item?: Connectable<unknown>;
};

export interface CountOutputs {
  output: number;
}

export function count(inputs: CountInputs, options?: NodeOptions): NodeWithOutputs<CountOutputs, "output"> {
  return createNode("nodetool.control.Count", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"int"}, defaultOutput: "output", streamingInput: true, inputMode: "stream", outputCorrelation: {"output":{"kind":"aggregate","source":"input_item","collapse":"innermost"}} });
}

// Distinct — nodetool.control.Distinct
export type DistinctInputs = {
  input_item?: Connectable<unknown>;
  key?: Connectable<string>;
};

export interface DistinctOutputs {
  output: unknown;
}

export function distinct(inputs: DistinctInputs, options?: NodeOptions): NodeWithOutputs<DistinctOutputs, "output"> {
  return createNode("nodetool.control.Distinct", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"any"}, defaultOutput: "output", streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: {"output":{"kind":"forward","source":"input_item"}} });
}

// Tap — nodetool.control.Tap
export type TapInputs = {
  input_item?: Connectable<unknown>;
  label?: Connectable<string>;
};

export interface TapOutputs {
  output: unknown;
}

export function tap(inputs: TapInputs, options?: NodeOptions): NodeWithOutputs<TapOutputs, "output"> {
  return createNode("nodetool.control.Tap", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"any"}, defaultOutput: "output", streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: {"output":{"kind":"forward","source":"input_item"}} });
}

// Collect — nodetool.control.Collect
export type CollectInputs = {
  input_item?: Connectable<unknown>;
};

export interface CollectOutputs {
  output: unknown[];
}

export function collect(inputs: CollectInputs, options?: NodeOptions): NodeWithOutputs<CollectOutputs, "output"> {
  return createNode("nodetool.control.Collect", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[any]"}, defaultOutput: "output", streamingInput: true, inputMode: "stream", outputCorrelation: {"output":{"kind":"aggregate","source":"input_item","collapse":"innermost"}} });
}

// Reroute — nodetool.control.Reroute
export type RerouteInputs = {
  input_value?: Connectable<unknown>;
};

export interface RerouteOutputs {
  output: unknown;
}

export function reroute(inputs: RerouteInputs, options?: NodeOptions): NodeWithOutputs<RerouteOutputs, "output"> {
  return createNode("nodetool.control.Reroute", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"any"}, defaultOutput: "output", streaming: true, inputMode: "buffered", outputCorrelation: {"output":{"kind":"forward","source":"input_value"}} });
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

export function switch_(inputs: SwitchInputs, options?: NodeOptions): NodeWithOutputs<SwitchOutputs> {
  return createNode("nodetool.control.Switch", inputs, { id: options?.id, outputNames: ["matched", "default", "index"], outputTypes: {"matched":"any","default":"any","index":"int"}, streaming: true, inputMode: "buffered", outputCorrelation: {"matched":{"kind":"forward","source":"input"},"default":{"kind":"forward","source":"input"},"index":{"kind":"single","source":"input"}} });
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

export function tryCatch(inputs: TryCatchInputs, options?: NodeOptions): NodeWithOutputs<TryCatchOutputs> {
  return createNode("nodetool.control.TryCatch", inputs, { id: options?.id, outputNames: ["output", "error", "has_error"], outputTypes: {"output":"any","error":"str","has_error":"bool"}, streaming: true, inputMode: "buffered", outputCorrelation: {"output":{"kind":"forward","source":"value"},"error":{"kind":"single","source":"value"},"has_error":{"kind":"single","source":"value"}} });
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

export function zip(inputs: ZipInputs, options?: NodeOptions): NodeWithOutputs<ZipOutputs> {
  return createNode("nodetool.control.Zip", inputs, { id: options?.id, outputNames: ["left", "right", "index"], outputTypes: {"left":"any","right":"any","index":"int"}, streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: {"left":{"kind":"iteration","source":"__execution__","group":"zip"},"right":{"kind":"iteration","source":"__execution__","group":"zip"},"index":{"kind":"iteration","source":"__execution__","group":"zip"}} });
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

export function cross(inputs: CrossInputs, options?: NodeOptions): NodeWithOutputs<CrossOutputs> {
  return createNode("nodetool.control.Cross", inputs, { id: options?.id, outputNames: ["left", "right"], outputTypes: {"left":"any","right":"any"}, streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: {"left":{"kind":"iteration","source":"__execution__","group":"cross"},"right":{"kind":"iteration","source":"__execution__","group":"cross"}} });
}
