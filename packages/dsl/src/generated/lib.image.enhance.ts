// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef } from "../types.js";

// Adaptive Contrast — lib.image.enhance.AdaptiveContrast
export type AdaptiveContrastInputs = {
  image?: Connectable<ImageRef>;
  clip_limit?: Connectable<number>;
  grid_size?: Connectable<number>;
};

export interface AdaptiveContrastOutputs {
  output: ImageRef;
}

export function adaptiveContrast(inputs: AdaptiveContrastInputs, options?: NodeOptions): NodeWithOutputs<AdaptiveContrastOutputs, "output"> {
  return createNode("lib.image.enhance.AdaptiveContrast", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Auto Contrast — lib.image.enhance.AutoContrast
export type AutoContrastInputs = {
  image?: Connectable<ImageRef>;
  cutoff?: Connectable<number>;
};

export interface AutoContrastOutputs {
  output: ImageRef;
}

export function autoContrast(inputs: AutoContrastInputs, options?: NodeOptions): NodeWithOutputs<AutoContrastOutputs, "output"> {
  return createNode("lib.image.enhance.AutoContrast", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Detail — lib.image.enhance.Detail
export type DetailInputs = {
  image?: Connectable<ImageRef>;
};

export interface DetailOutputs {
  output: ImageRef;
}

export function detail(inputs: DetailInputs, options?: NodeOptions): NodeWithOutputs<DetailOutputs, "output"> {
  return createNode("lib.image.enhance.Detail", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Edge Enhance — lib.image.enhance.EdgeEnhance
export type EdgeEnhanceInputs = {
  image?: Connectable<ImageRef>;
};

export interface EdgeEnhanceOutputs {
  output: ImageRef;
}

export function edgeEnhance(inputs: EdgeEnhanceInputs, options?: NodeOptions): NodeWithOutputs<EdgeEnhanceOutputs, "output"> {
  return createNode("lib.image.enhance.EdgeEnhance", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Equalize — lib.image.enhance.Equalize
export type EqualizeInputs = {
  image?: Connectable<ImageRef>;
};

export interface EqualizeOutputs {
  output: ImageRef;
}

export function equalize(inputs: EqualizeInputs, options?: NodeOptions): NodeWithOutputs<EqualizeOutputs, "output"> {
  return createNode("lib.image.enhance.Equalize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Rank Filter — lib.image.enhance.RankFilter
export type RankFilterInputs = {
  image?: Connectable<ImageRef>;
  size?: Connectable<number>;
  rank?: Connectable<number>;
};

export interface RankFilterOutputs {
  output: ImageRef;
}

export function rankFilter(inputs: RankFilterInputs, options?: NodeOptions): NodeWithOutputs<RankFilterOutputs, "output"> {
  return createNode("lib.image.enhance.RankFilter", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}
