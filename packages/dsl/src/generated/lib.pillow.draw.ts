// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { ImageRef } from "../types.js";

// Background — lib.pillow.draw.Background
export interface BackgroundInputs {
  width?: Connectable<number>;
  height?: Connectable<number>;
  color?: Connectable<unknown>;
}

export function background(inputs: BackgroundInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.draw.Background", inputs as Record<string, unknown>);
}

// Gaussian Noise — lib.pillow.draw.GaussianNoise
export interface GaussianNoiseInputs {
  mean?: Connectable<number>;
  stddev?: Connectable<number>;
  width?: Connectable<number>;
  height?: Connectable<number>;
}

export function gaussianNoise(inputs: GaussianNoiseInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.draw.GaussianNoise", inputs as Record<string, unknown>);
}

// Render Text — lib.pillow.draw.RenderText
export interface RenderTextInputs {
  text?: Connectable<string>;
  font?: Connectable<unknown>;
  x?: Connectable<number>;
  y?: Connectable<number>;
  size?: Connectable<number>;
  color?: Connectable<unknown>;
  align?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
}

export function renderText(inputs: RenderTextInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.pillow.draw.RenderText", inputs as Record<string, unknown>);
}
