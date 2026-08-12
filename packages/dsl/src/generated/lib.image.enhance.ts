// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
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

export function adaptiveContrast(inputs: AdaptiveContrastInputs): DslNode<AdaptiveContrastOutputs, "output"> {
  return createNode("lib.image.enhance.AdaptiveContrast", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Auto Contrast — lib.image.enhance.AutoContrast
export type AutoContrastInputs = {
  image?: Connectable<ImageRef>;
  cutoff?: Connectable<number>;
};

export interface AutoContrastOutputs {
  output: ImageRef;
}

export function autoContrast(inputs: AutoContrastInputs): DslNode<AutoContrastOutputs, "output"> {
  return createNode("lib.image.enhance.AutoContrast", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Detail — lib.image.enhance.Detail
export type DetailInputs = {
  image?: Connectable<ImageRef>;
};

export interface DetailOutputs {
  output: ImageRef;
}

export function detail(inputs: DetailInputs): DslNode<DetailOutputs, "output"> {
  return createNode("lib.image.enhance.Detail", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Edge Enhance — lib.image.enhance.EdgeEnhance
export type EdgeEnhanceInputs = {
  image?: Connectable<ImageRef>;
};

export interface EdgeEnhanceOutputs {
  output: ImageRef;
}

export function edgeEnhance(inputs: EdgeEnhanceInputs): DslNode<EdgeEnhanceOutputs, "output"> {
  return createNode("lib.image.enhance.EdgeEnhance", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Equalize — lib.image.enhance.Equalize
export type EqualizeInputs = {
  image?: Connectable<ImageRef>;
};

export interface EqualizeOutputs {
  output: ImageRef;
}

export function equalize(inputs: EqualizeInputs): DslNode<EqualizeOutputs, "output"> {
  return createNode("lib.image.enhance.Equalize", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function rankFilter(inputs: RankFilterInputs): DslNode<RankFilterOutputs, "output"> {
  return createNode("lib.image.enhance.RankFilter", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
