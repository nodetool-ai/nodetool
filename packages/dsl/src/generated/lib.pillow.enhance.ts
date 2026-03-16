// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { ImageRef } from "../types.js";

// Adaptive Contrast — lib.pillow.enhance.AdaptiveContrast
export interface AdaptiveContrastInputs {
  image?: Connectable<ImageRef>;
  clip_limit?: Connectable<number>;
  grid_size?: Connectable<number>;
}

export function adaptiveContrast(inputs: AdaptiveContrastInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.enhance.AdaptiveContrast", inputs as Record<string, unknown>);
}

// Auto Contrast — lib.pillow.enhance.AutoContrast
export interface AutoContrastInputs {
  image?: Connectable<ImageRef>;
  cutoff?: Connectable<number>;
}

export function autoContrast(inputs: AutoContrastInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.enhance.AutoContrast", inputs as Record<string, unknown>);
}

// Brightness — lib.pillow.enhance.Brightness
export interface BrightnessInputs {
  image?: Connectable<ImageRef>;
  factor?: Connectable<number>;
}

export function brightness(inputs: BrightnessInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.enhance.Brightness", inputs as Record<string, unknown>);
}

// Color — lib.pillow.enhance.Color
export interface ColorInputs {
  image?: Connectable<ImageRef>;
  factor?: Connectable<number>;
}

export function color(inputs: ColorInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.enhance.Color", inputs as Record<string, unknown>);
}

// Contrast — lib.pillow.enhance.Contrast
export interface ContrastInputs {
  image?: Connectable<ImageRef>;
  factor?: Connectable<number>;
}

export function contrast(inputs: ContrastInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.enhance.Contrast", inputs as Record<string, unknown>);
}

// Detail — lib.pillow.enhance.Detail
export interface DetailInputs {
  image?: Connectable<ImageRef>;
}

export function detail(inputs: DetailInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.enhance.Detail", inputs as Record<string, unknown>);
}

// Edge Enhance — lib.pillow.enhance.EdgeEnhance
export interface EdgeEnhanceInputs {
  image?: Connectable<ImageRef>;
}

export function edgeEnhance(inputs: EdgeEnhanceInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.enhance.EdgeEnhance", inputs as Record<string, unknown>);
}

// Equalize — lib.pillow.enhance.Equalize
export interface EqualizeInputs {
  image?: Connectable<ImageRef>;
}

export function equalize(inputs: EqualizeInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.enhance.Equalize", inputs as Record<string, unknown>);
}

// Rank Filter — lib.pillow.enhance.RankFilter
export interface RankFilterInputs {
  image?: Connectable<ImageRef>;
  size?: Connectable<number>;
  rank?: Connectable<number>;
}

export function rankFilter(inputs: RankFilterInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.enhance.RankFilter", inputs as Record<string, unknown>);
}

// Sharpen — lib.pillow.enhance.Sharpen
export interface SharpenInputs {
  image?: Connectable<ImageRef>;
}

export function sharpen(inputs: SharpenInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.enhance.Sharpen", inputs as Record<string, unknown>);
}

// Sharpness — lib.pillow.enhance.Sharpness
export interface SharpnessInputs {
  image?: Connectable<ImageRef>;
  factor?: Connectable<number>;
}

export function sharpness(inputs: SharpnessInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.enhance.Sharpness", inputs as Record<string, unknown>);
}

// Unsharp Mask — lib.pillow.enhance.UnsharpMask
export interface UnsharpMaskInputs {
  image?: Connectable<ImageRef>;
  radius?: Connectable<number>;
  percent?: Connectable<number>;
  threshold?: Connectable<number>;
}

export function unsharpMask(inputs: UnsharpMaskInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.enhance.UnsharpMask", inputs as Record<string, unknown>);
}
