// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
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

export function background(inputs: BackgroundInputs): DslNode<BackgroundOutputs, "output"> {
  return createNode("lib.image.draw.Background", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function gaussianNoise(inputs: GaussianNoiseInputs): DslNode<GaussianNoiseOutputs, "output"> {
  return createNode("lib.image.draw.GaussianNoise", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function renderText(inputs: RenderTextInputs): DslNode<RenderTextOutputs, "output"> {
  return createNode("lib.image.draw.RenderText", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function linearGradient(inputs: LinearGradientInputs): DslNode<LinearGradientOutputs, "output"> {
  return createNode("lib.image.draw.LinearGradient", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function radialGradient(inputs: RadialGradientInputs): DslNode<RadialGradientOutputs, "output"> {
  return createNode("lib.image.draw.RadialGradient", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function angularGradient(inputs: AngularGradientInputs): DslNode<AngularGradientOutputs, "output"> {
  return createNode("lib.image.draw.AngularGradient", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function diamondGradient(inputs: DiamondGradientInputs): DslNode<DiamondGradientOutputs, "output"> {
  return createNode("lib.image.draw.DiamondGradient", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function checkerboard(inputs: CheckerboardInputs): DslNode<CheckerboardOutputs, "output"> {
  return createNode("lib.image.draw.Checkerboard", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
