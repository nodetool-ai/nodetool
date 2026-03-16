// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { ImageRef } from "../types.js";

// Blur — lib.pillow.filter.Blur
export interface BlurInputs {
  image?: Connectable<ImageRef>;
  radius?: Connectable<number>;
}

export function blur(inputs: BlurInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.filter.Blur", inputs as Record<string, unknown>);
}

// Canny — lib.pillow.filter.Canny
export interface CannyInputs {
  image?: Connectable<ImageRef>;
  low_threshold?: Connectable<number>;
  high_threshold?: Connectable<number>;
}

export function canny(inputs: CannyInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.filter.Canny", inputs as Record<string, unknown>);
}

// Contour — lib.pillow.filter.Contour
export interface ContourInputs {
  image?: Connectable<ImageRef>;
}

export function contour(inputs: ContourInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.filter.Contour", inputs as Record<string, unknown>);
}

// Convert To Grayscale — lib.pillow.filter.ConvertToGrayscale
export interface ConvertToGrayscaleInputs {
  image?: Connectable<ImageRef>;
}

export function convertToGrayscale(inputs: ConvertToGrayscaleInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.filter.ConvertToGrayscale", inputs as Record<string, unknown>);
}

// Emboss — lib.pillow.filter.Emboss
export interface EmbossInputs {
  image?: Connectable<ImageRef>;
}

export function emboss(inputs: EmbossInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.filter.Emboss", inputs as Record<string, unknown>);
}

// Expand — lib.pillow.filter.Expand
export interface ExpandInputs {
  image?: Connectable<ImageRef>;
  border?: Connectable<number>;
  fill?: Connectable<number>;
}

export function expand(inputs: ExpandInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.filter.Expand", inputs as Record<string, unknown>);
}

// Find Edges — lib.pillow.filter.FindEdges
export interface FindEdgesInputs {
  image?: Connectable<ImageRef>;
}

export function findEdges(inputs: FindEdgesInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.filter.FindEdges", inputs as Record<string, unknown>);
}

// Get Channel — lib.pillow.filter.GetChannel
export interface GetChannelInputs {
  image?: Connectable<ImageRef>;
  channel?: Connectable<unknown>;
}

export function getChannel(inputs: GetChannelInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.filter.GetChannel", inputs as Record<string, unknown>);
}

// Invert — lib.pillow.filter.Invert
export interface InvertInputs {
  image?: Connectable<ImageRef>;
}

export function invert(inputs: InvertInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.filter.Invert", inputs as Record<string, unknown>);
}

// Posterize — lib.pillow.filter.Posterize
export interface PosterizeInputs {
  image?: Connectable<ImageRef>;
  bits?: Connectable<number>;
}

export function posterize(inputs: PosterizeInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.filter.Posterize", inputs as Record<string, unknown>);
}

// Smooth — lib.pillow.filter.Smooth
export interface SmoothInputs {
  image?: Connectable<ImageRef>;
}

export function smooth(inputs: SmoothInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.filter.Smooth", inputs as Record<string, unknown>);
}

// Solarize — lib.pillow.filter.Solarize
export interface SolarizeInputs {
  image?: Connectable<ImageRef>;
  threshold?: Connectable<number>;
}

export function solarize(inputs: SolarizeInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.filter.Solarize", inputs as Record<string, unknown>);
}
