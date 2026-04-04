// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type {
  ImageRef,
  AudioRef,
  DataframeRef,
  ChartConfig
} from "../types.js";

// Structured Output Generator — nodetool.generators.StructuredOutputGenerator
export interface StructuredOutputGeneratorInputs {
  system_prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  instructions?: Connectable<string>;
  context?: Connectable<string>;
  max_tokens?: Connectable<number>;
}

export interface StructuredOutputGeneratorOutputs {}

export function structuredOutputGenerator(
  inputs: StructuredOutputGeneratorInputs
): DslNode<StructuredOutputGeneratorOutputs> {
  return createNode(
    "nodetool.generators.StructuredOutputGenerator",
    inputs as Record<string, unknown>,
    { outputNames: [] }
  );
}

// Data Generator — nodetool.generators.DataGenerator
export interface DataGeneratorInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  input_text?: Connectable<string>;
  max_tokens?: Connectable<number>;
  columns?: Connectable<unknown>;
}

export interface DataGeneratorOutputs {
  record: Record<string, unknown>;
  dataframe: DataframeRef;
  index: number;
}

export function dataGenerator(
  inputs: DataGeneratorInputs
): DslNode<DataGeneratorOutputs> {
  return createNode(
    "nodetool.generators.DataGenerator",
    inputs as Record<string, unknown>,
    { outputNames: ["record", "dataframe", "index"], streaming: true }
  );
}

// List Generator — nodetool.generators.ListGenerator
export interface ListGeneratorInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  input_text?: Connectable<string>;
  max_tokens?: Connectable<number>;
}

export interface ListGeneratorOutputs {
  item: string;
  index: number;
}

export function listGenerator(
  inputs: ListGeneratorInputs
): DslNode<ListGeneratorOutputs> {
  return createNode(
    "nodetool.generators.ListGenerator",
    inputs as Record<string, unknown>,
    { outputNames: ["item", "index"], streaming: true }
  );
}

// Chart Generator — nodetool.generators.ChartGenerator
export interface ChartGeneratorInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  data?: Connectable<DataframeRef>;
  max_tokens?: Connectable<number>;
}

export interface ChartGeneratorOutputs {
  output: ChartConfig;
}

export function chartGenerator(
  inputs: ChartGeneratorInputs
): DslNode<ChartGeneratorOutputs, "output"> {
  return createNode(
    "nodetool.generators.ChartGenerator",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// SVGGenerator — nodetool.generators.SVGGenerator
export interface SVGGeneratorInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
  max_tokens?: Connectable<number>;
}

export interface SVGGeneratorOutputs {
  output: unknown[];
}

export function svgGenerator(
  inputs: SVGGeneratorInputs
): DslNode<SVGGeneratorOutputs, "output"> {
  return createNode(
    "nodetool.generators.SVGGenerator",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
