// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { TextRef } from "../types.js";

// Length — nodetool.list.Length
export interface LengthInputs {
  values?: Connectable<unknown[]>;
}

export interface LengthOutputs {
  output: number;
}

export function length(inputs: LengthInputs): DslNode<LengthOutputs, "output"> {
  return createNode("nodetool.list.Length", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// List Range — nodetool.list.ListRange
export interface ListRangeInputs {
  start?: Connectable<number>;
  stop?: Connectable<number>;
  step?: Connectable<number>;
}

export interface ListRangeOutputs {
  output: number[];
}

export function listRange(inputs: ListRangeInputs): DslNode<ListRangeOutputs, "output"> {
  return createNode("nodetool.list.ListRange", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Generate Sequence — nodetool.list.GenerateSequence
export interface GenerateSequenceInputs {
  start?: Connectable<number>;
  stop?: Connectable<number>;
  step?: Connectable<number>;
}

export interface GenerateSequenceOutputs {
  output: number;
}

export function generateSequence(inputs: GenerateSequenceInputs): DslNode<GenerateSequenceOutputs, "output"> {
  return createNode("nodetool.list.GenerateSequence", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streaming: true });
}

// Slice — nodetool.list.Slice
export interface SliceInputs {
  values?: Connectable<unknown[]>;
  start?: Connectable<number>;
  stop?: Connectable<number>;
  step?: Connectable<number>;
}

export interface SliceOutputs {
  output: unknown[];
}

export function slice(inputs: SliceInputs): DslNode<SliceOutputs, "output"> {
  return createNode("nodetool.list.Slice", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Select Elements — nodetool.list.SelectElements
export interface SelectElementsInputs {
  values?: Connectable<unknown[]>;
  indices?: Connectable<number[]>;
}

export interface SelectElementsOutputs {
  output: unknown[];
}

export function selectElements(inputs: SelectElementsInputs): DslNode<SelectElementsOutputs, "output"> {
  return createNode("nodetool.list.SelectElements", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Get Element — nodetool.list.GetElement
export interface GetElementInputs {
  values?: Connectable<unknown[]>;
  index?: Connectable<number>;
}

export interface GetElementOutputs {
  output: unknown;
}

export function getElement(inputs: GetElementInputs): DslNode<GetElementOutputs, "output"> {
  return createNode("nodetool.list.GetElement", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Append — nodetool.list.Append
export interface AppendInputs {
  values?: Connectable<unknown[]>;
  value?: Connectable<unknown>;
}

export interface AppendOutputs {
  output: unknown[];
}

export function append(inputs: AppendInputs): DslNode<AppendOutputs, "output"> {
  return createNode("nodetool.list.Append", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Extend — nodetool.list.Extend
export interface ExtendInputs {
  values?: Connectable<unknown[]>;
  other_values?: Connectable<unknown[]>;
}

export interface ExtendOutputs {
  output: unknown[];
}

export function extend(inputs: ExtendInputs): DslNode<ExtendOutputs, "output"> {
  return createNode("nodetool.list.Extend", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Dedupe — nodetool.list.Dedupe
export interface DedupeInputs {
  values?: Connectable<unknown[]>;
}

export interface DedupeOutputs {
  output: unknown[];
}

export function dedupe(inputs: DedupeInputs): DslNode<DedupeOutputs, "output"> {
  return createNode("nodetool.list.Dedupe", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Reverse — nodetool.list.Reverse
export interface ReverseInputs {
  values?: Connectable<unknown[]>;
}

export interface ReverseOutputs {
  output: unknown[];
}

export function reverse(inputs: ReverseInputs): DslNode<ReverseOutputs, "output"> {
  return createNode("nodetool.list.Reverse", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Randomize — nodetool.list.Randomize
export interface RandomizeInputs {
  values?: Connectable<unknown[]>;
}

export interface RandomizeOutputs {
  output: unknown[];
}

export function randomize(inputs: RandomizeInputs): DslNode<RandomizeOutputs, "output"> {
  return createNode("nodetool.list.Randomize", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Sort — nodetool.list.Sort
export interface SortInputs {
  values?: Connectable<unknown[]>;
  order?: Connectable<unknown>;
}

export interface SortOutputs {
  output: unknown[];
}

export function sort(inputs: SortInputs): DslNode<SortOutputs, "output"> {
  return createNode("nodetool.list.Sort", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Intersection — nodetool.list.Intersection
export interface IntersectionInputs {
  list1?: Connectable<unknown[]>;
  list2?: Connectable<unknown[]>;
}

export interface IntersectionOutputs {
  output: unknown[];
}

export function intersection(inputs: IntersectionInputs): DslNode<IntersectionOutputs, "output"> {
  return createNode("nodetool.list.Intersection", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Union — nodetool.list.Union
export interface UnionInputs {
  list1?: Connectable<unknown[]>;
  list2?: Connectable<unknown[]>;
}

export interface UnionOutputs {
  output: unknown[];
}

export function union(inputs: UnionInputs): DslNode<UnionOutputs, "output"> {
  return createNode("nodetool.list.Union", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Difference — nodetool.list.Difference
export interface DifferenceInputs {
  list1?: Connectable<unknown[]>;
  list2?: Connectable<unknown[]>;
}

export interface DifferenceOutputs {
  output: unknown[];
}

export function difference(inputs: DifferenceInputs): DslNode<DifferenceOutputs, "output"> {
  return createNode("nodetool.list.Difference", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Chunk — nodetool.list.Chunk
export interface ChunkInputs {
  values?: Connectable<unknown[]>;
  chunk_size?: Connectable<number>;
}

export interface ChunkOutputs {
  output: unknown[][];
}

export function chunk(inputs: ChunkInputs): DslNode<ChunkOutputs, "output"> {
  return createNode("nodetool.list.Chunk", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Sum — nodetool.list.Sum
export interface SumInputs {
  values?: Connectable<number[]>;
}

export interface SumOutputs {
  output: number;
}

export function sum(inputs: SumInputs): DslNode<SumOutputs, "output"> {
  return createNode("nodetool.list.Sum", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Average — nodetool.list.Average
export interface AverageInputs {
  values?: Connectable<number[]>;
}

export interface AverageOutputs {
  output: number;
}

export function average(inputs: AverageInputs): DslNode<AverageOutputs, "output"> {
  return createNode("nodetool.list.Average", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Minimum — nodetool.list.Minimum
export interface MinimumInputs {
  values?: Connectable<number[]>;
}

export interface MinimumOutputs {
  output: number;
}

export function minimum(inputs: MinimumInputs): DslNode<MinimumOutputs, "output"> {
  return createNode("nodetool.list.Minimum", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Maximum — nodetool.list.Maximum
export interface MaximumInputs {
  values?: Connectable<number[]>;
}

export interface MaximumOutputs {
  output: number;
}

export function maximum(inputs: MaximumInputs): DslNode<MaximumOutputs, "output"> {
  return createNode("nodetool.list.Maximum", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Product — nodetool.list.Product
export interface ProductInputs {
  values?: Connectable<number[]>;
}

export interface ProductOutputs {
  output: number;
}

export function product(inputs: ProductInputs): DslNode<ProductOutputs, "output"> {
  return createNode("nodetool.list.Product", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Flatten — nodetool.list.Flatten
export interface FlattenInputs {
  values?: Connectable<unknown[]>;
  max_depth?: Connectable<number>;
}

export interface FlattenOutputs {
  output: unknown[];
}

export function flatten(inputs: FlattenInputs): DslNode<FlattenOutputs, "output"> {
  return createNode("nodetool.list.Flatten", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Save List — nodetool.list.SaveList
export interface SaveListInputs {
  values?: Connectable<unknown[]>;
  name?: Connectable<string>;
}

export interface SaveListOutputs {
  output: TextRef;
}

export function saveList(inputs: SaveListInputs): DslNode<SaveListOutputs, "output"> {
  return createNode("nodetool.list.SaveList", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
