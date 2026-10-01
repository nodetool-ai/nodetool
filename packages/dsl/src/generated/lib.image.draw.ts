// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef } from "../types.js";

// Background — lib.image.draw.Background
export type BackgroundInputs = {
  width?: Connectable<number>;
  height?: Connectable<number>;
  color?: Connectable<unknown>;
};

export interface BackgroundOutputs {
  output: ImageRef;
}

export function background(inputs: BackgroundInputs, options?: NodeOptions): NodeWithOutputs<BackgroundOutputs, "output"> {
  return createNode("lib.image.draw.Background", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Gaussian Noise — lib.image.draw.GaussianNoise
export type GaussianNoiseInputs = {
  mean?: Connectable<number>;
  stddev?: Connectable<number>;
  width?: Connectable<number>;
  height?: Connectable<number>;
  seed?: Connectable<number>;
};

export interface GaussianNoiseOutputs {
  output: ImageRef;
}

export function gaussianNoise(inputs: GaussianNoiseInputs, options?: NodeOptions): NodeWithOutputs<GaussianNoiseOutputs, "output"> {
  return createNode("lib.image.draw.GaussianNoise", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Render Text — lib.image.draw.RenderText
export type RenderTextInputs = {
  text?: Connectable<string>;
  font?: Connectable<unknown>;
  x?: Connectable<number>;
  y?: Connectable<number>;
  size?: Connectable<number>;
  color?: Connectable<unknown>;
  align?: Connectable<"left" | "center" | "right">;
  image?: Connectable<ImageRef>;
};

export interface RenderTextOutputs {
  output: ImageRef;
}

export function renderText(inputs: RenderTextInputs, options?: NodeOptions): NodeWithOutputs<RenderTextOutputs, "output"> {
  return createNode("lib.image.draw.RenderText", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Linear Gradient — lib.image.draw.LinearGradient
export type LinearGradientInputs = {
  width?: Connectable<number>;
  height?: Connectable<number>;
  color_a?: Connectable<unknown>;
  color_b?: Connectable<unknown>;
  angle?: Connectable<number>;
  midpoint?: Connectable<number>;
};

export interface LinearGradientOutputs {
  output: ImageRef;
}

export function linearGradient(inputs: LinearGradientInputs, options?: NodeOptions): NodeWithOutputs<LinearGradientOutputs, "output"> {
  return createNode("lib.image.draw.LinearGradient", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Radial Gradient — lib.image.draw.RadialGradient
export type RadialGradientInputs = {
  width?: Connectable<number>;
  height?: Connectable<number>;
  color_inner?: Connectable<unknown>;
  color_outer?: Connectable<unknown>;
  radius?: Connectable<number>;
};

export interface RadialGradientOutputs {
  output: ImageRef;
}

export function radialGradient(inputs: RadialGradientInputs, options?: NodeOptions): NodeWithOutputs<RadialGradientOutputs, "output"> {
  return createNode("lib.image.draw.RadialGradient", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Angular Gradient — lib.image.draw.AngularGradient
export type AngularGradientInputs = {
  width?: Connectable<number>;
  height?: Connectable<number>;
  color_a?: Connectable<unknown>;
  color_b?: Connectable<unknown>;
  rotation?: Connectable<number>;
};

export interface AngularGradientOutputs {
  output: ImageRef;
}

export function angularGradient(inputs: AngularGradientInputs, options?: NodeOptions): NodeWithOutputs<AngularGradientOutputs, "output"> {
  return createNode("lib.image.draw.AngularGradient", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Diamond Gradient — lib.image.draw.DiamondGradient
export type DiamondGradientInputs = {
  width?: Connectable<number>;
  height?: Connectable<number>;
  color_inner?: Connectable<unknown>;
  color_outer?: Connectable<unknown>;
  radius?: Connectable<number>;
};

export interface DiamondGradientOutputs {
  output: ImageRef;
}

export function diamondGradient(inputs: DiamondGradientInputs, options?: NodeOptions): NodeWithOutputs<DiamondGradientOutputs, "output"> {
  return createNode("lib.image.draw.DiamondGradient", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Checkerboard — lib.image.draw.Checkerboard
export type CheckerboardInputs = {
  width?: Connectable<number>;
  height?: Connectable<number>;
  color_a?: Connectable<unknown>;
  color_b?: Connectable<unknown>;
  cell_size?: Connectable<number>;
};

export interface CheckerboardOutputs {
  output: ImageRef;
}

export function checkerboard(inputs: CheckerboardInputs, options?: NodeOptions): NodeWithOutputs<CheckerboardOutputs, "output"> {
  return createNode("lib.image.draw.Checkerboard", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}
