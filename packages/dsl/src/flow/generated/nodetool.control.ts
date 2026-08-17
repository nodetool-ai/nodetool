// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";

// If — nodetool.control.If
export type IfInputs = {
  condition?: boolean;
  value?: unknown;
};

export interface IfOutputs {
  if_true: unknown;
  if_false: unknown;
}

export function if_(inputs: IfInputs): Promise<IfOutputs> {
  return callNode<IfOutputs>("nodetool.control.If", inputs);
}

if_.stream = function (inputs: IfInputs): AsyncIterable<Partial<IfOutputs>> {
  return streamNode<Partial<IfOutputs>>("nodetool.control.If", inputs);
};

// For Each — nodetool.control.ForEach
export type ForEachInputs = {
  input_list?: unknown[];
  limit?: number;
};

export interface ForEachOutputs {
  output: unknown;
  index: number;
}

export function forEach(inputs: ForEachInputs): Promise<ForEachOutputs> {
  return callNode<ForEachOutputs>("nodetool.control.ForEach", inputs);
}

forEach.stream = function (inputs: ForEachInputs): AsyncIterable<Partial<ForEachOutputs>> {
  return streamNode<Partial<ForEachOutputs>>("nodetool.control.ForEach", inputs);
};

// Asset Collection — nodetool.control.Collection
export type CollectionInputs = {
  items?: unknown[];
};

export interface CollectionOutputs {
  output: unknown;
  index: number;
}

export function collection(inputs: CollectionInputs): Promise<CollectionOutputs> {
  return callNode<CollectionOutputs>("nodetool.control.Collection", inputs);
}

collection.stream = function (inputs: CollectionInputs): AsyncIterable<Partial<CollectionOutputs>> {
  return streamNode<Partial<CollectionOutputs>>("nodetool.control.Collection", inputs);
};

// Repeat Count — nodetool.control.RepeatCount
export type RepeatCountInputs = {
  count?: number;
};

export interface RepeatCountOutputs {
  output: number;
  index: number;
}

export function repeatCount(inputs: RepeatCountInputs): Promise<RepeatCountOutputs> {
  return callNode<RepeatCountOutputs>("nodetool.control.RepeatCount", inputs);
}

repeatCount.stream = function (inputs: RepeatCountInputs): AsyncIterable<Partial<RepeatCountOutputs>> {
  return streamNode<Partial<RepeatCountOutputs>>("nodetool.control.RepeatCount", inputs);
};

// Repeat Value — nodetool.control.RepeatValue
export type RepeatValueInputs = {
  value?: unknown;
  count?: number;
};

export interface RepeatValueOutputs {
  output: unknown;
  index: number;
}

export function repeatValue(inputs: RepeatValueInputs): Promise<RepeatValueOutputs> {
  return callNode<RepeatValueOutputs>("nodetool.control.RepeatValue", inputs);
}

repeatValue.stream = function (inputs: RepeatValueInputs): AsyncIterable<Partial<RepeatValueOutputs>> {
  return streamNode<Partial<RepeatValueOutputs>>("nodetool.control.RepeatValue", inputs);
};

// Take — nodetool.control.Take
export type TakeInputs = {
  input_item?: unknown | unknown[];
  n?: number | number[];
};

export interface TakeOutputs {
  output: unknown;
  index: number;
}

export function take(inputs: TakeInputs): Promise<TakeOutputs> {
  return callNode<TakeOutputs>("nodetool.control.Take", inputs);
}

take.stream = function (inputs: TakeInputs): AsyncIterable<{ slot: keyof TakeOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof TakeOutputs & string; value: unknown }>("nodetool.control.Take", inputs);
};

// Drop — nodetool.control.Drop
export type DropInputs = {
  input_item?: unknown | unknown[];
  n?: number | number[];
};

export interface DropOutputs {
  output: unknown;
  index: number;
}

export function drop(inputs: DropInputs): Promise<DropOutputs> {
  return callNode<DropOutputs>("nodetool.control.Drop", inputs);
}

drop.stream = function (inputs: DropInputs): AsyncIterable<{ slot: keyof DropOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof DropOutputs & string; value: unknown }>("nodetool.control.Drop", inputs);
};

// Take While — nodetool.control.TakeWhile
export type TakeWhileInputs = {
  input_item?: unknown | unknown[];
  predicate?: string | string[];
};

export interface TakeWhileOutputs {
  output: unknown;
}

export function takeWhile(inputs: TakeWhileInputs): Promise<TakeWhileOutputs> {
  return callNode<TakeWhileOutputs>("nodetool.control.TakeWhile", inputs);
}

takeWhile.stream = function (inputs: TakeWhileInputs): AsyncIterable<{ slot: keyof TakeWhileOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof TakeWhileOutputs & string; value: unknown }>("nodetool.control.TakeWhile", inputs);
};

// Drop While — nodetool.control.DropWhile
export type DropWhileInputs = {
  input_item?: unknown | unknown[];
  predicate?: string | string[];
};

export interface DropWhileOutputs {
  output: unknown;
}

export function dropWhile(inputs: DropWhileInputs): Promise<DropWhileOutputs> {
  return callNode<DropWhileOutputs>("nodetool.control.DropWhile", inputs);
}

dropWhile.stream = function (inputs: DropWhileInputs): AsyncIterable<{ slot: keyof DropWhileOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof DropWhileOutputs & string; value: unknown }>("nodetool.control.DropWhile", inputs);
};

// Filter Equal — nodetool.control.FilterEqual
export type FilterEqualInputs = {
  input_item?: unknown | unknown[];
  value?: unknown | unknown[];
  invert?: boolean | boolean[];
};

export interface FilterEqualOutputs {
  output: unknown;
}

export function filterEqual(inputs: FilterEqualInputs): Promise<FilterEqualOutputs> {
  return callNode<FilterEqualOutputs>("nodetool.control.FilterEqual", inputs);
}

filterEqual.stream = function (inputs: FilterEqualInputs): AsyncIterable<{ slot: keyof FilterEqualOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof FilterEqualOutputs & string; value: unknown }>("nodetool.control.FilterEqual", inputs);
};

// Filter (Expression) — nodetool.control.FilterCode
export type FilterCodeInputs = {
  input_item?: unknown | unknown[];
  predicate?: string | string[];
};

export interface FilterCodeOutputs {
  output: unknown;
}

export function filterCode(inputs: FilterCodeInputs): Promise<FilterCodeOutputs> {
  return callNode<FilterCodeOutputs>("nodetool.control.FilterCode", inputs);
}

filterCode.stream = function (inputs: FilterCodeInputs): AsyncIterable<{ slot: keyof FilterCodeOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof FilterCodeOutputs & string; value: unknown }>("nodetool.control.FilterCode", inputs);
};

// Chunk — nodetool.control.Chunk
export type ChunkInputs = {
  input_item?: unknown | unknown[];
  size?: number | number[];
};

export interface ChunkOutputs {
  output: unknown[];
  index: number;
}

export function chunk(inputs: ChunkInputs): Promise<ChunkOutputs> {
  return callNode<ChunkOutputs>("nodetool.control.Chunk", inputs);
}

chunk.stream = function (inputs: ChunkInputs): AsyncIterable<{ slot: keyof ChunkOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof ChunkOutputs & string; value: unknown }>("nodetool.control.Chunk", inputs);
};

// Last — nodetool.control.Last
export type LastInputs = {
  input_item?: unknown | unknown[];
};

export interface LastOutputs {
  output: unknown;
}

export function last(inputs: LastInputs): Promise<LastOutputs> {
  return callNode<LastOutputs>("nodetool.control.Last", inputs);
}

last.stream = function (inputs: LastInputs): AsyncIterable<{ slot: keyof LastOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof LastOutputs & string; value: unknown }>("nodetool.control.Last", inputs);
};

// Count — nodetool.control.Count
export type CountInputs = {
  input_item?: unknown | unknown[];
};

export interface CountOutputs {
  output: number;
}

export function count(inputs: CountInputs): Promise<CountOutputs> {
  return callNode<CountOutputs>("nodetool.control.Count", inputs);
}

count.stream = function (inputs: CountInputs): AsyncIterable<{ slot: keyof CountOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof CountOutputs & string; value: unknown }>("nodetool.control.Count", inputs);
};

// Distinct — nodetool.control.Distinct
export type DistinctInputs = {
  input_item?: unknown | unknown[];
  key?: string | string[];
};

export interface DistinctOutputs {
  output: unknown;
}

export function distinct(inputs: DistinctInputs): Promise<DistinctOutputs> {
  return callNode<DistinctOutputs>("nodetool.control.Distinct", inputs);
}

distinct.stream = function (inputs: DistinctInputs): AsyncIterable<{ slot: keyof DistinctOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof DistinctOutputs & string; value: unknown }>("nodetool.control.Distinct", inputs);
};

// Tap — nodetool.control.Tap
export type TapInputs = {
  input_item?: unknown | unknown[];
  label?: string | string[];
};

export interface TapOutputs {
  output: unknown;
}

export function tap(inputs: TapInputs): Promise<TapOutputs> {
  return callNode<TapOutputs>("nodetool.control.Tap", inputs);
}

tap.stream = function (inputs: TapInputs): AsyncIterable<{ slot: keyof TapOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof TapOutputs & string; value: unknown }>("nodetool.control.Tap", inputs);
};

// Collect — nodetool.control.Collect
export type CollectInputs = {
  input_item?: unknown | unknown[];
};

export interface CollectOutputs {
  output: unknown[];
}

export function collect(inputs: CollectInputs): Promise<CollectOutputs> {
  return callNode<CollectOutputs>("nodetool.control.Collect", inputs);
}

collect.stream = function (inputs: CollectInputs): AsyncIterable<{ slot: keyof CollectOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof CollectOutputs & string; value: unknown }>("nodetool.control.Collect", inputs);
};

// Reroute — nodetool.control.Reroute
export type RerouteInputs = {
  input_value?: unknown;
};

export interface RerouteOutputs {
  output: unknown;
}

export function reroute(inputs: RerouteInputs): Promise<RerouteOutputs> {
  return callNode<RerouteOutputs>("nodetool.control.Reroute", inputs);
}

reroute.stream = function (inputs: RerouteInputs): AsyncIterable<Partial<RerouteOutputs>> {
  return streamNode<Partial<RerouteOutputs>>("nodetool.control.Reroute", inputs);
};

// Switch — nodetool.control.Switch
export type SwitchInputs = {
  value?: unknown;
  cases?: unknown[];
  input?: unknown;
};

export interface SwitchOutputs {
  matched: unknown;
  default: unknown;
  index: number;
}

export function switch_(inputs: SwitchInputs): Promise<SwitchOutputs> {
  return callNode<SwitchOutputs>("nodetool.control.Switch", inputs);
}

switch_.stream = function (inputs: SwitchInputs): AsyncIterable<Partial<SwitchOutputs>> {
  return streamNode<Partial<SwitchOutputs>>("nodetool.control.Switch", inputs);
};

// Fallback — nodetool.control.TryCatch
export type TryCatchInputs = {
  value?: unknown;
  fallback?: unknown;
};

export interface TryCatchOutputs {
  output: unknown;
  error: string;
  has_error: boolean;
}

export function tryCatch(inputs: TryCatchInputs): Promise<TryCatchOutputs> {
  return callNode<TryCatchOutputs>("nodetool.control.TryCatch", inputs);
}

tryCatch.stream = function (inputs: TryCatchInputs): AsyncIterable<Partial<TryCatchOutputs>> {
  return streamNode<Partial<TryCatchOutputs>>("nodetool.control.TryCatch", inputs);
};

// Zip — nodetool.control.Zip
export type ZipInputs = {
  left?: unknown | unknown[];
  right?: unknown | unknown[];
  max_unmatched_pairs?: number | number[];
};

export interface ZipOutputs {
  left: unknown;
  right: unknown;
  index: number;
}

export function zip(inputs: ZipInputs): Promise<ZipOutputs> {
  return callNode<ZipOutputs>("nodetool.control.Zip", inputs);
}

zip.stream = function (inputs: ZipInputs): AsyncIterable<{ slot: keyof ZipOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof ZipOutputs & string; value: unknown }>("nodetool.control.Zip", inputs);
};

// Cross — nodetool.control.Cross
export type CrossInputs = {
  left?: unknown | unknown[];
  right?: unknown | unknown[];
  max_output_count?: number | number[];
};

export interface CrossOutputs {
  left: unknown;
  right: unknown;
}

export function cross(inputs: CrossInputs): Promise<CrossOutputs> {
  return callNode<CrossOutputs>("nodetool.control.Cross", inputs);
}

cross.stream = function (inputs: CrossInputs): AsyncIterable<{ slot: keyof CrossOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof CrossOutputs & string; value: unknown }>("nodetool.control.Cross", inputs);
};
