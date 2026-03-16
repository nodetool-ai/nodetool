// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";
import type { ImageRef, AudioRef, DataframeRef } from "../types.js";

// Structured Output Generator — nodetool.generators.StructuredOutputGenerator
export interface StructuredOutputGeneratorInputs {
  system_prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  instructions?: Connectable<string>;
  context?: Connectable<string>;
  max_tokens?: Connectable<number>;
}

export function structuredOutputGenerator(inputs: StructuredOutputGeneratorInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.generators.StructuredOutputGenerator", inputs as Record<string, unknown>);
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
  record: OutputHandle<Record<string, unknown>>;
  dataframe: OutputHandle<DataframeRef>;
  index: OutputHandle<number>;
}

export function dataGenerator(inputs: DataGeneratorInputs): DslNode<DataGeneratorOutputs> {
  return createNode("nodetool.generators.DataGenerator", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// List Generator — nodetool.generators.ListGenerator
export interface ListGeneratorInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  input_text?: Connectable<string>;
  max_tokens?: Connectable<number>;
}

export interface ListGeneratorOutputs {
  item: OutputHandle<string>;
  index: OutputHandle<number>;
}

export function listGenerator(inputs: ListGeneratorInputs): DslNode<ListGeneratorOutputs> {
  return createNode("nodetool.generators.ListGenerator", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Chart Generator — nodetool.generators.ChartGenerator
export interface ChartGeneratorInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  data?: Connectable<DataframeRef>;
  max_tokens?: Connectable<number>;
}

export function chartGenerator(inputs: ChartGeneratorInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.generators.ChartGenerator", inputs as Record<string, unknown>);
}

// SVGGenerator — nodetool.generators.SVGGenerator
export interface SVGGeneratorInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
  max_tokens?: Connectable<number>;
}

export function svgGenerator(inputs: SVGGeneratorInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("nodetool.generators.SVGGenerator", inputs as Record<string, unknown>);
}
