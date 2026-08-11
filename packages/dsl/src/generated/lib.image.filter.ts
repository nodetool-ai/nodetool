// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
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

export function canny(inputs: CannyInputs): DslNode<CannyOutputs, "output"> {
  return createNode("lib.image.filter.Canny", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Contour — lib.image.filter.Contour
export type ContourInputs = {
  image?: Connectable<ImageRef>;
};

export interface ContourOutputs {
  output: ImageRef;
}

export function contour(inputs: ContourInputs): DslNode<ContourOutputs, "output"> {
  return createNode("lib.image.filter.Contour", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Convert To Grayscale — lib.image.filter.ConvertToGrayscale
export type ConvertToGrayscaleInputs = {
  image?: Connectable<ImageRef>;
};

export interface ConvertToGrayscaleOutputs {
  output: ImageRef;
}

export function convertToGrayscale(inputs: ConvertToGrayscaleInputs): DslNode<ConvertToGrayscaleOutputs, "output"> {
  return createNode("lib.image.filter.ConvertToGrayscale", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Emboss — lib.image.filter.Emboss
export type EmbossInputs = {
  image?: Connectable<ImageRef>;
};

export interface EmbossOutputs {
  output: ImageRef;
}

export function emboss(inputs: EmbossInputs): DslNode<EmbossOutputs, "output"> {
  return createNode("lib.image.filter.Emboss", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function expand(inputs: ExpandInputs): DslNode<ExpandOutputs, "output"> {
  return createNode("lib.image.filter.Expand", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Find Edges — lib.image.filter.FindEdges
export type FindEdgesInputs = {
  image?: Connectable<ImageRef>;
};

export interface FindEdgesOutputs {
  output: ImageRef;
}

export function findEdges(inputs: FindEdgesInputs): DslNode<FindEdgesOutputs, "output"> {
  return createNode("lib.image.filter.FindEdges", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Invert — lib.image.filter.Invert
export type InvertInputs = {
  image?: Connectable<ImageRef>;
};

export interface InvertOutputs {
  output: ImageRef;
}

export function invert(inputs: InvertInputs): DslNode<InvertOutputs, "output"> {
  return createNode("lib.image.filter.Invert", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Posterize — lib.image.filter.Posterize
export type PosterizeInputs = {
  image?: Connectable<ImageRef>;
  bits?: Connectable<number>;
};

export interface PosterizeOutputs {
  output: ImageRef;
}

export function posterize(inputs: PosterizeInputs): DslNode<PosterizeOutputs, "output"> {
  return createNode("lib.image.filter.Posterize", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Smooth — lib.image.filter.Smooth
export type SmoothInputs = {
  image?: Connectable<ImageRef>;
};

export interface SmoothOutputs {
  output: ImageRef;
}

export function smooth(inputs: SmoothInputs): DslNode<SmoothOutputs, "output"> {
  return createNode("lib.image.filter.Smooth", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Solarize — lib.image.filter.Solarize
export type SolarizeInputs = {
  image?: Connectable<ImageRef>;
  threshold?: Connectable<number>;
};

export interface SolarizeOutputs {
  output: ImageRef;
}

export function solarize(inputs: SolarizeInputs): DslNode<SolarizeOutputs, "output"> {
  return createNode("lib.image.filter.Solarize", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function threshold(inputs: ThresholdInputs): DslNode<ThresholdOutputs, "output"> {
  return createNode("lib.image.filter.Threshold", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function pixelate(inputs: PixelateInputs): DslNode<PixelateOutputs, "output"> {
  return createNode("lib.image.filter.Pixelate", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function gaussianBlur(inputs: GaussianBlurInputs): DslNode<GaussianBlurOutputs, "output"> {
  return createNode("lib.image.filter.GaussianBlur", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function unsharpMask(inputs: UnsharpMaskInputs): DslNode<UnsharpMaskOutputs, "output"> {
  return createNode("lib.image.filter.UnsharpMask", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function vignette(inputs: VignetteInputs): DslNode<VignetteOutputs, "output"> {
  return createNode("lib.image.filter.Vignette", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
