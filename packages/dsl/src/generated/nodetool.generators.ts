// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, AudioRef, DataframeRef } from "../types.js";

// Structured Output Generator — nodetool.generators.StructuredOutputGenerator
export interface StructuredOutputGeneratorInputs {
  system_prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  instructions?: Connectable<string>;
  context?: Connectable<string>;
  max_tokens?: Connectable<number>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
}

export interface StructuredOutputGeneratorOutputs {
}

export function structuredOutputGenerator(inputs: StructuredOutputGeneratorInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<StructuredOutputGeneratorOutputs> {
  return createNode("nodetool.generators.StructuredOutputGenerator", inputs as Record<string, unknown>, { outputNames: [], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
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

export function dataGenerator(inputs: DataGeneratorInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DataGeneratorOutputs> {
  return createNode("nodetool.generators.DataGenerator", inputs as Record<string, unknown>, { outputNames: ["record", "dataframe", "index"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
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

export function listGenerator(inputs: ListGeneratorInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ListGeneratorOutputs> {
  return createNode("nodetool.generators.ListGenerator", inputs as Record<string, unknown>, { outputNames: ["item", "index"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Chart Generator — nodetool.generators.ChartGenerator
export interface ChartGeneratorInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  data?: Connectable<DataframeRef>;
  max_tokens?: Connectable<number>;
}

export interface ChartGeneratorOutputs {
  output: unknown;
}

export function chartGenerator(inputs: ChartGeneratorInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ChartGeneratorOutputs, "output"> {
  return createNode("nodetool.generators.ChartGenerator", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
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

export function svgGenerator(inputs: SVGGeneratorInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SVGGeneratorOutputs, "output"> {
  return createNode("nodetool.generators.SVGGenerator", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
