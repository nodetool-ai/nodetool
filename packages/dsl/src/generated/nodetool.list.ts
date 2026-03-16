// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { TextRef } from "../types.js";

// Length — nodetool.list.Length
export interface LengthInputs {
  values?: Connectable<unknown[]>;
}

export function length(inputs: LengthInputs): DslNode<SingleOutput<number>> {
  return createNode("nodetool.list.Length", inputs as Record<string, unknown>);
}

// List Range — nodetool.list.ListRange
export interface ListRangeInputs {
  start?: Connectable<number>;
  stop?: Connectable<number>;
  step?: Connectable<number>;
}

export function listRange(inputs: ListRangeInputs): DslNode<SingleOutput<number[]>> {
  return createNode("nodetool.list.ListRange", inputs as Record<string, unknown>);
}

// Generate Sequence — nodetool.list.GenerateSequence
export interface GenerateSequenceInputs {
  start?: Connectable<number>;
  stop?: Connectable<number>;
  step?: Connectable<number>;
}

export function generateSequence(inputs: GenerateSequenceInputs): DslNode<SingleOutput<number>> {
  return createNode("nodetool.list.GenerateSequence", inputs as Record<string, unknown>, { streaming: true });
}

// Slice — nodetool.list.Slice
export interface SliceInputs {
  values?: Connectable<unknown[]>;
  start?: Connectable<number>;
  stop?: Connectable<number>;
  step?: Connectable<number>;
}

export function slice(inputs: SliceInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("nodetool.list.Slice", inputs as Record<string, unknown>);
}

// Select Elements — nodetool.list.SelectElements
export interface SelectElementsInputs {
  values?: Connectable<unknown[]>;
  indices?: Connectable<number[]>;
}

export function selectElements(inputs: SelectElementsInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("nodetool.list.SelectElements", inputs as Record<string, unknown>);
}

// Get Element — nodetool.list.GetElement
export interface GetElementInputs {
  values?: Connectable<unknown[]>;
  index?: Connectable<number>;
}

export function getElement(inputs: GetElementInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.list.GetElement", inputs as Record<string, unknown>);
}

// Append — nodetool.list.Append
export interface AppendInputs {
  values?: Connectable<unknown[]>;
  value?: Connectable<unknown>;
}

export function append(inputs: AppendInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("nodetool.list.Append", inputs as Record<string, unknown>);
}

// Extend — nodetool.list.Extend
export interface ExtendInputs {
  values?: Connectable<unknown[]>;
  other_values?: Connectable<unknown[]>;
}

export function extend(inputs: ExtendInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("nodetool.list.Extend", inputs as Record<string, unknown>);
}

// Dedupe — nodetool.list.Dedupe
export interface DedupeInputs {
  values?: Connectable<unknown[]>;
}

export function dedupe(inputs: DedupeInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("nodetool.list.Dedupe", inputs as Record<string, unknown>);
}

// Reverse — nodetool.list.Reverse
export interface ReverseInputs {
  values?: Connectable<unknown[]>;
}

export function reverse(inputs: ReverseInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("nodetool.list.Reverse", inputs as Record<string, unknown>);
}

// Randomize — nodetool.list.Randomize
export interface RandomizeInputs {
  values?: Connectable<unknown[]>;
}

export function randomize(inputs: RandomizeInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("nodetool.list.Randomize", inputs as Record<string, unknown>);
}

// Sort — nodetool.list.Sort
export interface SortInputs {
  values?: Connectable<unknown[]>;
  order?: Connectable<unknown>;
}

export function sort(inputs: SortInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("nodetool.list.Sort", inputs as Record<string, unknown>);
}

// Intersection — nodetool.list.Intersection
export interface IntersectionInputs {
  list1?: Connectable<unknown[]>;
  list2?: Connectable<unknown[]>;
}

export function intersection(inputs: IntersectionInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("nodetool.list.Intersection", inputs as Record<string, unknown>);
}

// Union — nodetool.list.Union
export interface UnionInputs {
  list1?: Connectable<unknown[]>;
  list2?: Connectable<unknown[]>;
}

export function union(inputs: UnionInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("nodetool.list.Union", inputs as Record<string, unknown>);
}

// Difference — nodetool.list.Difference
export interface DifferenceInputs {
  list1?: Connectable<unknown[]>;
  list2?: Connectable<unknown[]>;
}

export function difference(inputs: DifferenceInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("nodetool.list.Difference", inputs as Record<string, unknown>);
}

// Chunk — nodetool.list.Chunk
export interface ChunkInputs {
  values?: Connectable<unknown[]>;
  chunk_size?: Connectable<number>;
}

export function chunk(inputs: ChunkInputs): DslNode<SingleOutput<unknown[][]>> {
  return createNode("nodetool.list.Chunk", inputs as Record<string, unknown>);
}

// Sum — nodetool.list.Sum
export interface SumInputs {
  values?: Connectable<number[]>;
}

export function sum(inputs: SumInputs): DslNode<SingleOutput<number>> {
  return createNode("nodetool.list.Sum", inputs as Record<string, unknown>);
}

// Average — nodetool.list.Average
export interface AverageInputs {
  values?: Connectable<number[]>;
}

export function average(inputs: AverageInputs): DslNode<SingleOutput<number>> {
  return createNode("nodetool.list.Average", inputs as Record<string, unknown>);
}

// Minimum — nodetool.list.Minimum
export interface MinimumInputs {
  values?: Connectable<number[]>;
}

export function minimum(inputs: MinimumInputs): DslNode<SingleOutput<number>> {
  return createNode("nodetool.list.Minimum", inputs as Record<string, unknown>);
}

// Maximum — nodetool.list.Maximum
export interface MaximumInputs {
  values?: Connectable<number[]>;
}

export function maximum(inputs: MaximumInputs): DslNode<SingleOutput<number>> {
  return createNode("nodetool.list.Maximum", inputs as Record<string, unknown>);
}

// Product — nodetool.list.Product
export interface ProductInputs {
  values?: Connectable<number[]>;
}

export function product(inputs: ProductInputs): DslNode<SingleOutput<number>> {
  return createNode("nodetool.list.Product", inputs as Record<string, unknown>);
}

// Flatten — nodetool.list.Flatten
export interface FlattenInputs {
  values?: Connectable<unknown[]>;
  max_depth?: Connectable<number>;
}

export function flatten(inputs: FlattenInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("nodetool.list.Flatten", inputs as Record<string, unknown>);
}

// Save List — nodetool.list.SaveList
export interface SaveListInputs {
  values?: Connectable<unknown[]>;
  name?: Connectable<string>;
}

export function saveList(inputs: SaveListInputs): DslNode<SingleOutput<TextRef>> {
  return createNode("nodetool.list.SaveList", inputs as Record<string, unknown>);
}
