// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Canny — lib.image.filter.Canny
export type CannyInputs = {
  image?: ImageRef;
  low_threshold?: number;
  high_threshold?: number;
};

export interface CannyOutputs {
  output: ImageRef;
}

export function canny(inputs: CannyInputs): Promise<CannyOutputs> {
  return callNode<CannyOutputs>("lib.image.filter.Canny", inputs);
}

// Contour — lib.image.filter.Contour
export type ContourInputs = {
  image?: ImageRef;
};

export interface ContourOutputs {
  output: ImageRef;
}

export function contour(inputs: ContourInputs): Promise<ContourOutputs> {
  return callNode<ContourOutputs>("lib.image.filter.Contour", inputs);
}

// Convert To Grayscale — lib.image.filter.ConvertToGrayscale
export type ConvertToGrayscaleInputs = {
  image?: ImageRef;
};

export interface ConvertToGrayscaleOutputs {
  output: ImageRef;
}

export function convertToGrayscale(inputs: ConvertToGrayscaleInputs): Promise<ConvertToGrayscaleOutputs> {
  return callNode<ConvertToGrayscaleOutputs>("lib.image.filter.ConvertToGrayscale", inputs);
}

// Emboss — lib.image.filter.Emboss
export type EmbossInputs = {
  image?: ImageRef;
};

export interface EmbossOutputs {
  output: ImageRef;
}

export function emboss(inputs: EmbossInputs): Promise<EmbossOutputs> {
  return callNode<EmbossOutputs>("lib.image.filter.Emboss", inputs);
}

// Expand — lib.image.filter.Expand
export type ExpandInputs = {
  image?: ImageRef;
  border?: number;
  fill?: number;
};

export interface ExpandOutputs {
  output: ImageRef;
}

export function expand(inputs: ExpandInputs): Promise<ExpandOutputs> {
  return callNode<ExpandOutputs>("lib.image.filter.Expand", inputs);
}

// Find Edges — lib.image.filter.FindEdges
export type FindEdgesInputs = {
  image?: ImageRef;
};

export interface FindEdgesOutputs {
  output: ImageRef;
}

export function findEdges(inputs: FindEdgesInputs): Promise<FindEdgesOutputs> {
  return callNode<FindEdgesOutputs>("lib.image.filter.FindEdges", inputs);
}

// Invert — lib.image.filter.Invert
export type InvertInputs = {
  image?: ImageRef;
};

export interface InvertOutputs {
  output: ImageRef;
}

export function invert(inputs: InvertInputs): Promise<InvertOutputs> {
  return callNode<InvertOutputs>("lib.image.filter.Invert", inputs);
}

// Posterize — lib.image.filter.Posterize
export type PosterizeInputs = {
  image?: ImageRef;
  bits?: number;
};

export interface PosterizeOutputs {
  output: ImageRef;
}

export function posterize(inputs: PosterizeInputs): Promise<PosterizeOutputs> {
  return callNode<PosterizeOutputs>("lib.image.filter.Posterize", inputs);
}

// Smooth — lib.image.filter.Smooth
export type SmoothInputs = {
  image?: ImageRef;
};

export interface SmoothOutputs {
  output: ImageRef;
}

export function smooth(inputs: SmoothInputs): Promise<SmoothOutputs> {
  return callNode<SmoothOutputs>("lib.image.filter.Smooth", inputs);
}

// Solarize — lib.image.filter.Solarize
export type SolarizeInputs = {
  image?: ImageRef;
  threshold?: number;
};

export interface SolarizeOutputs {
  output: ImageRef;
}

export function solarize(inputs: SolarizeInputs): Promise<SolarizeOutputs> {
  return callNode<SolarizeOutputs>("lib.image.filter.Solarize", inputs);
}

// Threshold — lib.image.filter.Threshold
export type ThresholdInputs = {
  image?: ImageRef;
  threshold?: number;
  softness?: number;
};

export interface ThresholdOutputs {
  output: ImageRef;
}

export function threshold(inputs: ThresholdInputs): Promise<ThresholdOutputs> {
  return callNode<ThresholdOutputs>("lib.image.filter.Threshold", inputs);
}

// Pixelate — lib.image.filter.Pixelate
export type PixelateInputs = {
  image?: ImageRef;
  mask?: ImageRef;
  cell_size?: number;
};

export interface PixelateOutputs {
  output: ImageRef;
}

export function pixelate(inputs: PixelateInputs): Promise<PixelateOutputs> {
  return callNode<PixelateOutputs>("lib.image.filter.Pixelate", inputs);
}

// Gaussian Blur — lib.image.filter.GaussianBlur
export type GaussianBlurInputs = {
  image?: ImageRef;
  radius?: number;
  sigma?: number;
};

export interface GaussianBlurOutputs {
  output: ImageRef;
}

export function gaussianBlur(inputs: GaussianBlurInputs): Promise<GaussianBlurOutputs> {
  return callNode<GaussianBlurOutputs>("lib.image.filter.GaussianBlur", inputs);
}

// Unsharp Mask — lib.image.filter.UnsharpMask
export type UnsharpMaskInputs = {
  image?: ImageRef;
  mask?: ImageRef;
  amount?: number;
  threshold?: number;
};

export interface UnsharpMaskOutputs {
  output: ImageRef;
}

export function unsharpMask(inputs: UnsharpMaskInputs): Promise<UnsharpMaskOutputs> {
  return callNode<UnsharpMaskOutputs>("lib.image.filter.UnsharpMask", inputs);
}

// Vignette — lib.image.filter.Vignette
export type VignetteInputs = {
  image?: ImageRef;
  mask?: ImageRef;
  intensity?: number;
  radius?: number;
  softness?: number;
};

export interface VignetteOutputs {
  output: ImageRef;
}

export function vignette(inputs: VignetteInputs): Promise<VignetteOutputs> {
  return callNode<VignetteOutputs>("lib.image.filter.Vignette", inputs);
}
