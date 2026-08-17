// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";
import type { ImageRef, AudioRef, DataframeRef } from "../../types.js";

// Structured Output Generator — nodetool.generators.StructuredOutputGenerator
export type StructuredOutputGeneratorInputs = {
  system_prompt?: string;
  model?: unknown;
  instructions?: string;
  context?: string;
  max_tokens?: number;
  image?: ImageRef[];
  audio?: AudioRef[];
};

export interface StructuredOutputGeneratorOutputs {
}

export function structuredOutputGenerator(inputs: StructuredOutputGeneratorInputs): Promise<StructuredOutputGeneratorOutputs> {
  return callNode<StructuredOutputGeneratorOutputs>("nodetool.generators.StructuredOutputGenerator", inputs);
}

// Data Generator — nodetool.generators.DataGenerator
export type DataGeneratorInputs = {
  model?: unknown;
  prompt?: string;
  input_text?: string;
  max_tokens?: number;
  columns?: unknown;
};

export interface DataGeneratorOutputs {
  record: Record<string, unknown>;
  dataframe: DataframeRef;
  index: number;
}

export function dataGenerator(inputs: DataGeneratorInputs): Promise<DataGeneratorOutputs> {
  return callNode<DataGeneratorOutputs>("nodetool.generators.DataGenerator", inputs);
}

dataGenerator.stream = function (inputs: DataGeneratorInputs): AsyncIterable<Partial<DataGeneratorOutputs>> {
  return streamNode<Partial<DataGeneratorOutputs>>("nodetool.generators.DataGenerator", inputs);
};

// List Generator — nodetool.generators.ListGenerator
export type ListGeneratorInputs = {
  model?: unknown;
  prompt?: string;
  input_text?: string;
  max_tokens?: number;
};

export interface ListGeneratorOutputs {
  item: string;
  index: number;
  output: string[];
}

export function listGenerator(inputs: ListGeneratorInputs): Promise<ListGeneratorOutputs> {
  return callNode<ListGeneratorOutputs>("nodetool.generators.ListGenerator", inputs);
}

listGenerator.stream = function (inputs: ListGeneratorInputs): AsyncIterable<Partial<ListGeneratorOutputs>> {
  return streamNode<Partial<ListGeneratorOutputs>>("nodetool.generators.ListGenerator", inputs);
};

// Chart Generator — nodetool.generators.ChartGenerator
export type ChartGeneratorInputs = {
  model?: unknown;
  prompt?: string;
  data?: DataframeRef;
  max_tokens?: number;
};

export interface ChartGeneratorOutputs {
  output: unknown;
}

export function chartGenerator(inputs: ChartGeneratorInputs): Promise<ChartGeneratorOutputs> {
  return callNode<ChartGeneratorOutputs>("nodetool.generators.ChartGenerator", inputs);
}

// SVGGenerator — nodetool.generators.SVGGenerator
export type SVGGeneratorInputs = {
  model?: unknown;
  prompt?: string;
  image?: ImageRef[];
  audio?: AudioRef[];
  max_tokens?: number;
};

export interface SVGGeneratorOutputs {
  output: unknown[];
}

export function svgGenerator(inputs: SVGGeneratorInputs): Promise<SVGGeneratorOutputs> {
  return callNode<SVGGeneratorOutputs>("nodetool.generators.SVGGenerator", inputs);
}
