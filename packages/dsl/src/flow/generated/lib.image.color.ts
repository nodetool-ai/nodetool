// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Invert — lib.image.color.Invert
export type InvertInputs = {
  image?: ImageRef;
  mask?: ImageRef;
  amount?: number;
};

export interface InvertOutputs {
  output: ImageRef;
}

export function invert(inputs: InvertInputs): Promise<InvertOutputs> {
  return callNode<InvertOutputs>("lib.image.color.Invert", inputs);
}

// Brightness / Contrast — lib.image.color.BrightnessContrast
export type BrightnessContrastInputs = {
  image?: ImageRef;
  mask?: ImageRef;
  brightness?: number;
  contrast?: number;
};

export interface BrightnessContrastOutputs {
  output: ImageRef;
}

export function brightnessContrast(inputs: BrightnessContrastInputs): Promise<BrightnessContrastOutputs> {
  return callNode<BrightnessContrastOutputs>("lib.image.color.BrightnessContrast", inputs);
}

// HSB — lib.image.color.HSB
export type HSBInputs = {
  image?: ImageRef;
  mask?: ImageRef;
  hue?: number;
  saturation?: number;
  brightness?: number;
};

export interface HSBOutputs {
  output: ImageRef;
}

export function hsb(inputs: HSBInputs): Promise<HSBOutputs> {
  return callNode<HSBOutputs>("lib.image.color.HSB", inputs);
}

// Exposure — lib.image.color.Exposure
export type ExposureInputs = {
  image?: ImageRef;
  mask?: ImageRef;
  stops?: number;
};

export interface ExposureOutputs {
  output: ImageRef;
}

export function exposure(inputs: ExposureInputs): Promise<ExposureOutputs> {
  return callNode<ExposureOutputs>("lib.image.color.Exposure", inputs);
}

// Posterize — lib.image.color.Posterize
export type PosterizeInputs = {
  image?: ImageRef;
  mask?: ImageRef;
  levels?: number;
};

export interface PosterizeOutputs {
  output: ImageRef;
}

export function posterize(inputs: PosterizeInputs): Promise<PosterizeOutputs> {
  return callNode<PosterizeOutputs>("lib.image.color.Posterize", inputs);
}

// Color Grade — lib.image.color.Grade
export type GradeInputs = {
  image?: ImageRef;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hue?: number;
  temperature?: number;
  tint?: number;
  shadows?: number;
  highlights?: number;
};

export interface GradeOutputs {
  output: ImageRef;
}

export function grade(inputs: GradeInputs): Promise<GradeOutputs> {
  return callNode<GradeOutputs>("lib.image.color.Grade", inputs);
}

// Channel Split — lib.image.color.ChannelSplit
export type ChannelSplitInputs = {
  image?: ImageRef;
  mode?: number;
};

export interface ChannelSplitOutputs {
  output: ImageRef;
}

export function channelSplit(inputs: ChannelSplitInputs): Promise<ChannelSplitOutputs> {
  return callNode<ChannelSplitOutputs>("lib.image.color.ChannelSplit", inputs);
}
