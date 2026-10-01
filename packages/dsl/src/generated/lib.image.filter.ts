// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef } from "../types.js";

// Canny — lib.image.filter.Canny
export type CannyInputs = {
  image?: Connectable<ImageRef>;
  low_threshold?: Connectable<number>;
  high_threshold?: Connectable<number>;
};

export interface CannyOutputs {
  output: ImageRef;
}

export function canny(inputs: CannyInputs, options?: NodeOptions): NodeWithOutputs<CannyOutputs, "output"> {
  return createNode("lib.image.filter.Canny", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Contour — lib.image.filter.Contour
export type ContourInputs = {
  image?: Connectable<ImageRef>;
};

export interface ContourOutputs {
  output: ImageRef;
}

export function contour(inputs: ContourInputs, options?: NodeOptions): NodeWithOutputs<ContourOutputs, "output"> {
  return createNode("lib.image.filter.Contour", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Convert To Grayscale — lib.image.filter.ConvertToGrayscale
export type ConvertToGrayscaleInputs = {
  image?: Connectable<ImageRef>;
};

export interface ConvertToGrayscaleOutputs {
  output: ImageRef;
}

export function convertToGrayscale(inputs: ConvertToGrayscaleInputs, options?: NodeOptions): NodeWithOutputs<ConvertToGrayscaleOutputs, "output"> {
  return createNode("lib.image.filter.ConvertToGrayscale", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Emboss — lib.image.filter.Emboss
export type EmbossInputs = {
  image?: Connectable<ImageRef>;
};

export interface EmbossOutputs {
  output: ImageRef;
}

export function emboss(inputs: EmbossInputs, options?: NodeOptions): NodeWithOutputs<EmbossOutputs, "output"> {
  return createNode("lib.image.filter.Emboss", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Expand — lib.image.filter.Expand
export type ExpandInputs = {
  image?: Connectable<ImageRef>;
  border?: Connectable<number>;
  fill?: Connectable<number>;
};

export interface ExpandOutputs {
  output: ImageRef;
}

export function expand(inputs: ExpandInputs, options?: NodeOptions): NodeWithOutputs<ExpandOutputs, "output"> {
  return createNode("lib.image.filter.Expand", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Find Edges — lib.image.filter.FindEdges
export type FindEdgesInputs = {
  image?: Connectable<ImageRef>;
};

export interface FindEdgesOutputs {
  output: ImageRef;
}

export function findEdges(inputs: FindEdgesInputs, options?: NodeOptions): NodeWithOutputs<FindEdgesOutputs, "output"> {
  return createNode("lib.image.filter.FindEdges", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Invert — lib.image.filter.Invert
export type InvertInputs = {
  image?: Connectable<ImageRef>;
};

export interface InvertOutputs {
  output: ImageRef;
}

export function invert(inputs: InvertInputs, options?: NodeOptions): NodeWithOutputs<InvertOutputs, "output"> {
  return createNode("lib.image.filter.Invert", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Posterize — lib.image.filter.Posterize
export type PosterizeInputs = {
  image?: Connectable<ImageRef>;
  bits?: Connectable<number>;
};

export interface PosterizeOutputs {
  output: ImageRef;
}

export function posterize(inputs: PosterizeInputs, options?: NodeOptions): NodeWithOutputs<PosterizeOutputs, "output"> {
  return createNode("lib.image.filter.Posterize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Smooth — lib.image.filter.Smooth
export type SmoothInputs = {
  image?: Connectable<ImageRef>;
};

export interface SmoothOutputs {
  output: ImageRef;
}

export function smooth(inputs: SmoothInputs, options?: NodeOptions): NodeWithOutputs<SmoothOutputs, "output"> {
  return createNode("lib.image.filter.Smooth", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Solarize — lib.image.filter.Solarize
export type SolarizeInputs = {
  image?: Connectable<ImageRef>;
  threshold?: Connectable<number>;
};

export interface SolarizeOutputs {
  output: ImageRef;
}

export function solarize(inputs: SolarizeInputs, options?: NodeOptions): NodeWithOutputs<SolarizeOutputs, "output"> {
  return createNode("lib.image.filter.Solarize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Threshold — lib.image.filter.Threshold
export type ThresholdInputs = {
  image?: Connectable<ImageRef>;
  threshold?: Connectable<number>;
  softness?: Connectable<number>;
};

export interface ThresholdOutputs {
  output: ImageRef;
}

export function threshold(inputs: ThresholdInputs, options?: NodeOptions): NodeWithOutputs<ThresholdOutputs, "output"> {
  return createNode("lib.image.filter.Threshold", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Pixelate — lib.image.filter.Pixelate
export type PixelateInputs = {
  image?: Connectable<ImageRef>;
  mask?: Connectable<ImageRef>;
  cell_size?: Connectable<number>;
};

export interface PixelateOutputs {
  output: ImageRef;
}

export function pixelate(inputs: PixelateInputs, options?: NodeOptions): NodeWithOutputs<PixelateOutputs, "output"> {
  return createNode("lib.image.filter.Pixelate", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Gaussian Blur — lib.image.filter.GaussianBlur
export type GaussianBlurInputs = {
  image?: Connectable<ImageRef>;
  radius?: Connectable<number>;
  sigma?: Connectable<number>;
};

export interface GaussianBlurOutputs {
  output: ImageRef;
}

export function gaussianBlur(inputs: GaussianBlurInputs, options?: NodeOptions): NodeWithOutputs<GaussianBlurOutputs, "output"> {
  return createNode("lib.image.filter.GaussianBlur", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Unsharp Mask — lib.image.filter.UnsharpMask
export type UnsharpMaskInputs = {
  image?: Connectable<ImageRef>;
  mask?: Connectable<ImageRef>;
  amount?: Connectable<number>;
  threshold?: Connectable<number>;
};

export interface UnsharpMaskOutputs {
  output: ImageRef;
}

export function unsharpMask(inputs: UnsharpMaskInputs, options?: NodeOptions): NodeWithOutputs<UnsharpMaskOutputs, "output"> {
  return createNode("lib.image.filter.UnsharpMask", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Vignette — lib.image.filter.Vignette
export type VignetteInputs = {
  image?: Connectable<ImageRef>;
  mask?: Connectable<ImageRef>;
  intensity?: Connectable<number>;
  radius?: Connectable<number>;
  softness?: Connectable<number>;
};

export interface VignetteOutputs {
  output: ImageRef;
}

export function vignette(inputs: VignetteInputs, options?: NodeOptions): NodeWithOutputs<VignetteOutputs, "output"> {
  return createNode("lib.image.filter.Vignette", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}
