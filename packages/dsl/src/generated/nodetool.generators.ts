// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
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

export function structuredOutputGenerator(inputs: StructuredOutputGeneratorInputs, options?: NodeOptions): NodeWithOutputs<StructuredOutputGeneratorOutputs> {
  return createNode("nodetool.generators.StructuredOutputGenerator", inputs, { id: options?.id, outputNames: [], outputTypes: {} });
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

export function dataGenerator(inputs: DataGeneratorInputs, options?: NodeOptions): NodeWithOutputs<DataGeneratorOutputs> {
  return createNode("nodetool.generators.DataGenerator", inputs, { id: options?.id, outputNames: ["record", "dataframe", "index"], outputTypes: {"record":"dict","dataframe":"dataframe","index":"int"}, streaming: true, inputMode: "buffered", outputCorrelation: {"record":{"kind":"iteration","source":"__execution__","group":"items"},"index":{"kind":"iteration","source":"__execution__","group":"items"},"dataframe":{"kind":"single","source":"__execution__"}} });
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

export function listGenerator(inputs: ListGeneratorInputs, options?: NodeOptions): NodeWithOutputs<ListGeneratorOutputs> {
  return createNode("nodetool.generators.ListGenerator", inputs, { id: options?.id, outputNames: ["item", "index", "output"], outputTypes: {"item":"str","index":"int","output":"list[str]"}, streaming: true, inputMode: "buffered", outputCorrelation: {"item":{"kind":"iteration","source":"__execution__","group":"items"},"index":{"kind":"iteration","source":"__execution__","group":"items"},"output":{"kind":"single","source":"__execution__"}} });
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

export function chartGenerator(inputs: ChartGeneratorInputs, options?: NodeOptions): NodeWithOutputs<ChartGeneratorOutputs, "output"> {
  return createNode("nodetool.generators.ChartGenerator", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"chart_config"}, defaultOutput: "output" });
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

export function svgGenerator(inputs: SVGGeneratorInputs, options?: NodeOptions): NodeWithOutputs<SVGGeneratorOutputs, "output"> {
  return createNode("nodetool.generators.SVGGenerator", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[svg_element]"}, defaultOutput: "output" });
}
