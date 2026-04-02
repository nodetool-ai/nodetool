// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Adaptive Contrast — lib.pillow.enhance.AdaptiveContrast
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
    "lib.pillow.enhance.AdaptiveContrast",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Auto Contrast — lib.pillow.enhance.AutoContrast
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
    "lib.pillow.enhance.AutoContrast",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Brightness — lib.pillow.enhance.Brightness
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
    "lib.pillow.enhance.Brightness",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Color — lib.pillow.enhance.Color
export interface ColorInputs {
  image?: Connectable<ImageRef>;
  factor?: Connectable<number>;
}

export interface ColorOutputs {
  output: ImageRef;
}

export function color(inputs: ColorInputs): DslNode<ColorOutputs, "output"> {
  return createNode(
    "lib.pillow.enhance.Color",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Contrast — lib.pillow.enhance.Contrast
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
    "lib.pillow.enhance.Contrast",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Detail — lib.pillow.enhance.Detail
export interface DetailInputs {
  image?: Connectable<ImageRef>;
}

export interface DetailOutputs {
  output: ImageRef;
}

export function detail(inputs: DetailInputs): DslNode<DetailOutputs, "output"> {
  return createNode(
    "lib.pillow.enhance.Detail",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Edge Enhance — lib.pillow.enhance.EdgeEnhance
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
    "lib.pillow.enhance.EdgeEnhance",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Equalize — lib.pillow.enhance.Equalize
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
    "lib.pillow.enhance.Equalize",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Rank Filter — lib.pillow.enhance.RankFilter
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
    "lib.pillow.enhance.RankFilter",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Sharpen — lib.pillow.enhance.Sharpen
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
    "lib.pillow.enhance.Sharpen",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Sharpness — lib.pillow.enhance.Sharpness
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
    "lib.pillow.enhance.Sharpness",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Unsharp Mask — lib.pillow.enhance.UnsharpMask
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
    "lib.pillow.enhance.UnsharpMask",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
