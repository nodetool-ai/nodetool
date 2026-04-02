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

export function blur(inputs: BlurInputs): DslNode<BlurOutputs, "output"> {
  return createNode(
    "lib.image.filter.Blur",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function canny(inputs: CannyInputs): DslNode<CannyOutputs, "output"> {
  return createNode(
    "lib.image.filter.Canny",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Contour — lib.image.filter.Contour
export interface ContourInputs {
  image?: Connectable<ImageRef>;
}

export interface ContourOutputs {
  output: ImageRef;
}

export function contour(
  inputs: ContourInputs
): DslNode<ContourOutputs, "output"> {
  return createNode(
    "lib.image.filter.Contour",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Convert To Grayscale — lib.image.filter.ConvertToGrayscale
export interface ConvertToGrayscaleInputs {
  image?: Connectable<ImageRef>;
}

export interface ConvertToGrayscaleOutputs {
  output: ImageRef;
}

export function convertToGrayscale(
  inputs: ConvertToGrayscaleInputs
): DslNode<ConvertToGrayscaleOutputs, "output"> {
  return createNode(
    "lib.image.filter.ConvertToGrayscale",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Emboss — lib.image.filter.Emboss
export interface EmbossInputs {
  image?: Connectable<ImageRef>;
}

export interface EmbossOutputs {
  output: ImageRef;
}

export function emboss(inputs: EmbossInputs): DslNode<EmbossOutputs, "output"> {
  return createNode(
    "lib.image.filter.Emboss",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function expand(inputs: ExpandInputs): DslNode<ExpandOutputs, "output"> {
  return createNode(
    "lib.image.filter.Expand",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Find Edges — lib.image.filter.FindEdges
export interface FindEdgesInputs {
  image?: Connectable<ImageRef>;
}

export interface FindEdgesOutputs {
  output: ImageRef;
}

export function findEdges(
  inputs: FindEdgesInputs
): DslNode<FindEdgesOutputs, "output"> {
  return createNode(
    "lib.image.filter.FindEdges",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Get Channel — lib.image.filter.GetChannel
export interface GetChannelInputs {
  image?: Connectable<ImageRef>;
  channel?: Connectable<unknown>;
}

export interface GetChannelOutputs {
  output: ImageRef;
}

export function getChannel(
  inputs: GetChannelInputs
): DslNode<GetChannelOutputs, "output"> {
  return createNode(
    "lib.image.filter.GetChannel",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Invert — lib.image.filter.Invert
export interface InvertInputs {
  image?: Connectable<ImageRef>;
}

export interface InvertOutputs {
  output: ImageRef;
}

export function invert(inputs: InvertInputs): DslNode<InvertOutputs, "output"> {
  return createNode(
    "lib.image.filter.Invert",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Posterize — lib.image.filter.Posterize
export interface PosterizeInputs {
  image?: Connectable<ImageRef>;
  bits?: Connectable<number>;
}

export interface PosterizeOutputs {
  output: ImageRef;
}

export function posterize(
  inputs: PosterizeInputs
): DslNode<PosterizeOutputs, "output"> {
  return createNode(
    "lib.image.filter.Posterize",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Smooth — lib.image.filter.Smooth
export interface SmoothInputs {
  image?: Connectable<ImageRef>;
}

export interface SmoothOutputs {
  output: ImageRef;
}

export function smooth(inputs: SmoothInputs): DslNode<SmoothOutputs, "output"> {
  return createNode(
    "lib.image.filter.Smooth",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Solarize — lib.image.filter.Solarize
export interface SolarizeInputs {
  image?: Connectable<ImageRef>;
  threshold?: Connectable<number>;
}

export interface SolarizeOutputs {
  output: ImageRef;
}

export function solarize(
  inputs: SolarizeInputs
): DslNode<SolarizeOutputs, "output"> {
  return createNode(
    "lib.image.filter.Solarize",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
