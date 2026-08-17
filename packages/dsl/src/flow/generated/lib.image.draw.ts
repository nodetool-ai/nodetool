// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Background — lib.image.draw.Background
export type BackgroundInputs = {
  width?: number;
  height?: number;
  color?: unknown;
};

export interface BackgroundOutputs {
  output: ImageRef;
}

export function background(inputs: BackgroundInputs): Promise<BackgroundOutputs> {
  return callNode<BackgroundOutputs>("lib.image.draw.Background", inputs);
}

// Gaussian Noise — lib.image.draw.GaussianNoise
export type GaussianNoiseInputs = {
  mean?: number;
  stddev?: number;
  width?: number;
  height?: number;
  seed?: number;
};

export interface GaussianNoiseOutputs {
  output: ImageRef;
}

export function gaussianNoise(inputs: GaussianNoiseInputs): Promise<GaussianNoiseOutputs> {
  return callNode<GaussianNoiseOutputs>("lib.image.draw.GaussianNoise", inputs);
}

// Render Text — lib.image.draw.RenderText
export type RenderTextInputs = {
  text?: string;
  font?: unknown;
  x?: number;
  y?: number;
  size?: number;
  color?: unknown;
  align?: "left" | "center" | "right";
  image?: ImageRef;
};

export interface RenderTextOutputs {
  output: ImageRef;
}

export function renderText(inputs: RenderTextInputs): Promise<RenderTextOutputs> {
  return callNode<RenderTextOutputs>("lib.image.draw.RenderText", inputs);
}

// Linear Gradient — lib.image.draw.LinearGradient
export type LinearGradientInputs = {
  width?: number;
  height?: number;
  color_a?: unknown;
  color_b?: unknown;
  angle?: number;
  midpoint?: number;
};

export interface LinearGradientOutputs {
  output: ImageRef;
}

export function linearGradient(inputs: LinearGradientInputs): Promise<LinearGradientOutputs> {
  return callNode<LinearGradientOutputs>("lib.image.draw.LinearGradient", inputs);
}

// Radial Gradient — lib.image.draw.RadialGradient
export type RadialGradientInputs = {
  width?: number;
  height?: number;
  color_inner?: unknown;
  color_outer?: unknown;
  radius?: number;
};

export interface RadialGradientOutputs {
  output: ImageRef;
}

export function radialGradient(inputs: RadialGradientInputs): Promise<RadialGradientOutputs> {
  return callNode<RadialGradientOutputs>("lib.image.draw.RadialGradient", inputs);
}

// Angular Gradient — lib.image.draw.AngularGradient
export type AngularGradientInputs = {
  width?: number;
  height?: number;
  color_a?: unknown;
  color_b?: unknown;
  rotation?: number;
};

export interface AngularGradientOutputs {
  output: ImageRef;
}

export function angularGradient(inputs: AngularGradientInputs): Promise<AngularGradientOutputs> {
  return callNode<AngularGradientOutputs>("lib.image.draw.AngularGradient", inputs);
}

// Diamond Gradient — lib.image.draw.DiamondGradient
export type DiamondGradientInputs = {
  width?: number;
  height?: number;
  color_inner?: unknown;
  color_outer?: unknown;
  radius?: number;
};

export interface DiamondGradientOutputs {
  output: ImageRef;
}

export function diamondGradient(inputs: DiamondGradientInputs): Promise<DiamondGradientOutputs> {
  return callNode<DiamondGradientOutputs>("lib.image.draw.DiamondGradient", inputs);
}

// Checkerboard — lib.image.draw.Checkerboard
export type CheckerboardInputs = {
  width?: number;
  height?: number;
  color_a?: unknown;
  color_b?: unknown;
  cell_size?: number;
};

export interface CheckerboardOutputs {
  output: ImageRef;
}

export function checkerboard(inputs: CheckerboardInputs): Promise<CheckerboardOutputs> {
  return callNode<CheckerboardOutputs>("lib.image.draw.Checkerboard", inputs);
}
