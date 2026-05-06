// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Background — lib.image.draw.Background
export interface BackgroundInputs {
  width?: Connectable<number>;
  height?: Connectable<number>;
  color?: Connectable<unknown>;
}

export interface BackgroundOutputs {
  output: ImageRef;
}

export function background(inputs: BackgroundInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<BackgroundOutputs, "output"> {
  return createNode("lib.image.draw.Background", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Gaussian Noise — lib.image.draw.GaussianNoise
export interface GaussianNoiseInputs {
  mean?: Connectable<number>;
  stddev?: Connectable<number>;
  width?: Connectable<number>;
  height?: Connectable<number>;
}

export interface GaussianNoiseOutputs {
  output: ImageRef;
}

export function gaussianNoise(inputs: GaussianNoiseInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GaussianNoiseOutputs, "output"> {
  return createNode("lib.image.draw.GaussianNoise", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Render Text — lib.image.draw.RenderText
export interface RenderTextInputs {
  text?: Connectable<string>;
  font?: Connectable<unknown>;
  x?: Connectable<number>;
  y?: Connectable<number>;
  size?: Connectable<number>;
  color?: Connectable<unknown>;
  align?: Connectable<"left" | "center" | "right">;
  image?: Connectable<ImageRef>;
}

export interface RenderTextOutputs {
  output: ImageRef;
}

export function renderText(inputs: RenderTextInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RenderTextOutputs, "output"> {
  return createNode("lib.image.draw.RenderText", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
