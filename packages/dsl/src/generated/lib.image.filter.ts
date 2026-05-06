// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Blur — lib.image.filter.Blur
export interface BlurInputs {
  image?: Connectable<ImageRef>;
  radius?: Connectable<number>;
}

export interface BlurOutputs {
  output: ImageRef;
}

export function blur(inputs: BlurInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<BlurOutputs, "output"> {
  return createNode("lib.image.filter.Blur", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Canny — lib.image.filter.Canny
export interface CannyInputs {
  image?: Connectable<ImageRef>;
  low_threshold?: Connectable<number>;
  high_threshold?: Connectable<number>;
}

export interface CannyOutputs {
  output: ImageRef;
}

export function canny(inputs: CannyInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CannyOutputs, "output"> {
  return createNode("lib.image.filter.Canny", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Contour — lib.image.filter.Contour
export interface ContourInputs {
  image?: Connectable<ImageRef>;
}

export interface ContourOutputs {
  output: ImageRef;
}

export function contour(inputs: ContourInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ContourOutputs, "output"> {
  return createNode("lib.image.filter.Contour", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Convert To Grayscale — lib.image.filter.ConvertToGrayscale
export interface ConvertToGrayscaleInputs {
  image?: Connectable<ImageRef>;
}

export interface ConvertToGrayscaleOutputs {
  output: ImageRef;
}

export function convertToGrayscale(inputs: ConvertToGrayscaleInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ConvertToGrayscaleOutputs, "output"> {
  return createNode("lib.image.filter.ConvertToGrayscale", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Emboss — lib.image.filter.Emboss
export interface EmbossInputs {
  image?: Connectable<ImageRef>;
}

export interface EmbossOutputs {
  output: ImageRef;
}

export function emboss(inputs: EmbossInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<EmbossOutputs, "output"> {
  return createNode("lib.image.filter.Emboss", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Expand — lib.image.filter.Expand
export interface ExpandInputs {
  image?: Connectable<ImageRef>;
  border?: Connectable<number>;
  fill?: Connectable<number>;
}

export interface ExpandOutputs {
  output: ImageRef;
}

export function expand(inputs: ExpandInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExpandOutputs, "output"> {
  return createNode("lib.image.filter.Expand", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Find Edges — lib.image.filter.FindEdges
export interface FindEdgesInputs {
  image?: Connectable<ImageRef>;
}

export interface FindEdgesOutputs {
  output: ImageRef;
}

export function findEdges(inputs: FindEdgesInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FindEdgesOutputs, "output"> {
  return createNode("lib.image.filter.FindEdges", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Get Channel — lib.image.filter.GetChannel
export interface GetChannelInputs {
  image?: Connectable<ImageRef>;
  channel?: Connectable<"R" | "G" | "B">;
}

export interface GetChannelOutputs {
  output: ImageRef;
}

export function getChannel(inputs: GetChannelInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GetChannelOutputs, "output"> {
  return createNode("lib.image.filter.GetChannel", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Invert — lib.image.filter.Invert
export interface InvertInputs {
  image?: Connectable<ImageRef>;
}

export interface InvertOutputs {
  output: ImageRef;
}

export function invert(inputs: InvertInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<InvertOutputs, "output"> {
  return createNode("lib.image.filter.Invert", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Posterize — lib.image.filter.Posterize
export interface PosterizeInputs {
  image?: Connectable<ImageRef>;
  bits?: Connectable<number>;
}

export interface PosterizeOutputs {
  output: ImageRef;
}

export function posterize(inputs: PosterizeInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<PosterizeOutputs, "output"> {
  return createNode("lib.image.filter.Posterize", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Smooth — lib.image.filter.Smooth
export interface SmoothInputs {
  image?: Connectable<ImageRef>;
}

export interface SmoothOutputs {
  output: ImageRef;
}

export function smooth(inputs: SmoothInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SmoothOutputs, "output"> {
  return createNode("lib.image.filter.Smooth", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Solarize — lib.image.filter.Solarize
export interface SolarizeInputs {
  image?: Connectable<ImageRef>;
  threshold?: Connectable<number>;
}

export interface SolarizeOutputs {
  output: ImageRef;
}

export function solarize(inputs: SolarizeInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SolarizeOutputs, "output"> {
  return createNode("lib.image.filter.Solarize", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
