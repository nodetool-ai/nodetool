// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Adaptive Contrast — lib.image.enhance.AdaptiveContrast
export type AdaptiveContrastInputs = {
  image?: ImageRef;
  clip_limit?: number;
  grid_size?: number;
};

export interface AdaptiveContrastOutputs {
  output: ImageRef;
}

export function adaptiveContrast(inputs: AdaptiveContrastInputs): Promise<AdaptiveContrastOutputs> {
  return callNode<AdaptiveContrastOutputs>("lib.image.enhance.AdaptiveContrast", inputs);
}

// Auto Contrast — lib.image.enhance.AutoContrast
export type AutoContrastInputs = {
  image?: ImageRef;
  cutoff?: number;
};

export interface AutoContrastOutputs {
  output: ImageRef;
}

export function autoContrast(inputs: AutoContrastInputs): Promise<AutoContrastOutputs> {
  return callNode<AutoContrastOutputs>("lib.image.enhance.AutoContrast", inputs);
}

// Detail — lib.image.enhance.Detail
export type DetailInputs = {
  image?: ImageRef;
};

export interface DetailOutputs {
  output: ImageRef;
}

export function detail(inputs: DetailInputs): Promise<DetailOutputs> {
  return callNode<DetailOutputs>("lib.image.enhance.Detail", inputs);
}

// Edge Enhance — lib.image.enhance.EdgeEnhance
export type EdgeEnhanceInputs = {
  image?: ImageRef;
};

export interface EdgeEnhanceOutputs {
  output: ImageRef;
}

export function edgeEnhance(inputs: EdgeEnhanceInputs): Promise<EdgeEnhanceOutputs> {
  return callNode<EdgeEnhanceOutputs>("lib.image.enhance.EdgeEnhance", inputs);
}

// Equalize — lib.image.enhance.Equalize
export type EqualizeInputs = {
  image?: ImageRef;
};

export interface EqualizeOutputs {
  output: ImageRef;
}

export function equalize(inputs: EqualizeInputs): Promise<EqualizeOutputs> {
  return callNode<EqualizeOutputs>("lib.image.enhance.Equalize", inputs);
}

// Rank Filter — lib.image.enhance.RankFilter
export type RankFilterInputs = {
  image?: ImageRef;
  size?: number;
  rank?: number;
};

export interface RankFilterOutputs {
  output: ImageRef;
}

export function rankFilter(inputs: RankFilterInputs): Promise<RankFilterOutputs> {
  return callNode<RankFilterOutputs>("lib.image.enhance.RankFilter", inputs);
}
