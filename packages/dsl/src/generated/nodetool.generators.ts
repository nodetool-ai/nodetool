// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, AudioRef, DataframeRef } from "../types.js";

// Structured Output Generator — nodetool.generators.StructuredOutputGenerator
export type StructuredOutputGeneratorInputs = {
  system_prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  instructions?: Connectable<string>;
  context?: Connectable<string>;
  max_tokens?: Connectable<number>;
  image?: Connectable<ImageRef[]>;
  audio?: Connectable<AudioRef[]>;
};

export interface StructuredOutputGeneratorOutputs {
}

export function structuredOutputGenerator(inputs: StructuredOutputGeneratorInputs): DslNode<StructuredOutputGeneratorOutputs> {
  return createNode("nodetool.generators.StructuredOutputGenerator", inputs, { outputNames: [] });
}

// Data Generator — nodetool.generators.DataGenerator
export type DataGeneratorInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  input_text?: Connectable<string>;
  max_tokens?: Connectable<number>;
  columns?: Connectable<unknown>;
};

export interface DataGeneratorOutputs {
  record: Record<string, unknown>;
  dataframe: DataframeRef;
  index: number;
}

export function dataGenerator(inputs: DataGeneratorInputs): DslNode<DataGeneratorOutputs> {
  return createNode("nodetool.generators.DataGenerator", inputs, { outputNames: ["record", "dataframe", "index"], streaming: true });
}

// List Generator — nodetool.generators.ListGenerator
export type ListGeneratorInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  input_text?: Connectable<string>;
  max_tokens?: Connectable<number>;
};

export interface ListGeneratorOutputs {
  item: string;
  index: number;
  output: string[];
}

export function listGenerator(inputs: ListGeneratorInputs): DslNode<ListGeneratorOutputs> {
  return createNode("nodetool.generators.ListGenerator", inputs, { outputNames: ["item", "index", "output"], streaming: true });
}

// Chart Generator — nodetool.generators.ChartGenerator
export type ChartGeneratorInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  data?: Connectable<DataframeRef>;
  max_tokens?: Connectable<number>;
};

export interface ChartGeneratorOutputs {
  output: unknown;
}

export function chartGenerator(inputs: ChartGeneratorInputs): DslNode<ChartGeneratorOutputs, "output"> {
  return createNode("nodetool.generators.ChartGenerator", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// SVGGenerator — nodetool.generators.SVGGenerator
export type SVGGeneratorInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef[]>;
  audio?: Connectable<AudioRef[]>;
  max_tokens?: Connectable<number>;
};

export interface SVGGeneratorOutputs {
  output: unknown[];
}

export function svgGenerator(inputs: SVGGeneratorInputs): DslNode<SVGGeneratorOutputs, "output"> {
  return createNode("nodetool.generators.SVGGenerator", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
