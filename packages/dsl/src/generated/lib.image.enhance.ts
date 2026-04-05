// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Adaptive Contrast — lib.image.enhance.AdaptiveContrast
export interface AdaptiveContrastInputs {
  image?: Connectable<ImageRef>;
  clip_limit?: Connectable<number>;
  grid_size?: Connectable<number>;
}

export interface AdaptiveContrastOutputs {
  output: ImageRef;
}

export function adaptiveContrast(
  inputs: AdaptiveContrastInputs
): DslNode<AdaptiveContrastOutputs, "output"> {
  return createNode(
    "lib.image.enhance.AdaptiveContrast",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Auto Contrast — lib.image.enhance.AutoContrast
export interface AutoContrastInputs {
  image?: Connectable<ImageRef>;
  cutoff?: Connectable<number>;
}

export interface AutoContrastOutputs {
  output: ImageRef;
}

export function autoContrast(
  inputs: AutoContrastInputs
): DslNode<AutoContrastOutputs, "output"> {
  return createNode(
    "lib.image.enhance.AutoContrast",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Brightness — lib.image.enhance.Brightness
export interface BrightnessInputs {
  image?: Connectable<ImageRef>;
  factor?: Connectable<number>;
}

export interface BrightnessOutputs {
  output: ImageRef;
}

export function brightness(
  inputs: BrightnessInputs
): DslNode<BrightnessOutputs, "output"> {
  return createNode(
    "lib.image.enhance.Brightness",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Color — lib.image.enhance.Color
export interface ColorInputs {
  image?: Connectable<ImageRef>;
  factor?: Connectable<number>;
}

export interface ColorOutputs {
  output: ImageRef;
}

export function color(inputs: ColorInputs): DslNode<ColorOutputs, "output"> {
  return createNode(
    "lib.image.enhance.Color",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Contrast — lib.image.enhance.Contrast
export interface ContrastInputs {
  image?: Connectable<ImageRef>;
  factor?: Connectable<number>;
}

export interface ContrastOutputs {
  output: ImageRef;
}

export function contrast(
  inputs: ContrastInputs
): DslNode<ContrastOutputs, "output"> {
  return createNode(
    "lib.image.enhance.Contrast",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Detail — lib.image.enhance.Detail
export interface DetailInputs {
  image?: Connectable<ImageRef>;
}

export interface DetailOutputs {
  output: ImageRef;
}

export function detail(inputs: DetailInputs): DslNode<DetailOutputs, "output"> {
  return createNode(
    "lib.image.enhance.Detail",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Edge Enhance — lib.image.enhance.EdgeEnhance
export interface EdgeEnhanceInputs {
  image?: Connectable<ImageRef>;
}

export interface EdgeEnhanceOutputs {
  output: ImageRef;
}

export function edgeEnhance(
  inputs: EdgeEnhanceInputs
): DslNode<EdgeEnhanceOutputs, "output"> {
  return createNode(
    "lib.image.enhance.EdgeEnhance",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Equalize — lib.image.enhance.Equalize
export interface EqualizeInputs {
  image?: Connectable<ImageRef>;
}

export interface EqualizeOutputs {
  output: ImageRef;
}

export function equalize(
  inputs: EqualizeInputs
): DslNode<EqualizeOutputs, "output"> {
  return createNode(
    "lib.image.enhance.Equalize",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Rank Filter — lib.image.enhance.RankFilter
export interface RankFilterInputs {
  image?: Connectable<ImageRef>;
  size?: Connectable<number>;
  rank?: Connectable<number>;
}

export interface RankFilterOutputs {
  output: ImageRef;
}

export function rankFilter(
  inputs: RankFilterInputs
): DslNode<RankFilterOutputs, "output"> {
  return createNode(
    "lib.image.enhance.RankFilter",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Sharpen — lib.image.enhance.Sharpen
export interface SharpenInputs {
  image?: Connectable<ImageRef>;
}

export interface SharpenOutputs {
  output: ImageRef;
}

export function sharpen(
  inputs: SharpenInputs
): DslNode<SharpenOutputs, "output"> {
  return createNode(
    "lib.image.enhance.Sharpen",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Sharpness — lib.image.enhance.Sharpness
export interface SharpnessInputs {
  image?: Connectable<ImageRef>;
  factor?: Connectable<number>;
}

export interface SharpnessOutputs {
  output: ImageRef;
}

export function sharpness(
  inputs: SharpnessInputs
): DslNode<SharpnessOutputs, "output"> {
  return createNode(
    "lib.image.enhance.Sharpness",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Unsharp Mask — lib.image.enhance.UnsharpMask
export interface UnsharpMaskInputs {
  image?: Connectable<ImageRef>;
  radius?: Connectable<number>;
  percent?: Connectable<number>;
  threshold?: Connectable<number>;
}

export interface UnsharpMaskOutputs {
  output: ImageRef;
}

export function unsharpMask(
  inputs: UnsharpMaskInputs
): DslNode<UnsharpMaskOutputs, "output"> {
  return createNode(
    "lib.image.enhance.UnsharpMask",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
