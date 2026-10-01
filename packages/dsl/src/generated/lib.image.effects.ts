// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef } from "../types.js";

// Color Overlay — lib.image.effects.ColorOverlay
export type ColorOverlayInputs = {
  image?: Connectable<ImageRef>;
  color?: Connectable<unknown>;
  amount?: Connectable<number>;
};

export interface ColorOverlayOutputs {
  output: ImageRef;
}

export function colorOverlay(inputs: ColorOverlayInputs, options?: NodeOptions): NodeWithOutputs<ColorOverlayOutputs, "output"> {
  return createNode("lib.image.effects.ColorOverlay", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Outline — lib.image.effects.Outline
export type OutlineInputs = {
  image?: Connectable<ImageRef>;
  color?: Connectable<unknown>;
  width?: Connectable<number>;
  threshold?: Connectable<number>;
};

export interface OutlineOutputs {
  output: ImageRef;
}

export function outline(inputs: OutlineInputs, options?: NodeOptions): NodeWithOutputs<OutlineOutputs, "output"> {
  return createNode("lib.image.effects.Outline", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Drop Shadow — lib.image.effects.DropShadow
export type DropShadowInputs = {
  image?: Connectable<ImageRef>;
  color?: Connectable<unknown>;
  offset_x?: Connectable<number>;
  offset_y?: Connectable<number>;
  radius?: Connectable<number>;
  intensity?: Connectable<number>;
};

export interface DropShadowOutputs {
  output: ImageRef;
}

export function dropShadow(inputs: DropShadowInputs, options?: NodeOptions): NodeWithOutputs<DropShadowOutputs, "output"> {
  return createNode("lib.image.effects.DropShadow", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Glow — lib.image.effects.Glow
export type GlowInputs = {
  image?: Connectable<ImageRef>;
  threshold?: Connectable<number>;
  softness?: Connectable<number>;
  radius?: Connectable<number>;
  intensity?: Connectable<number>;
};

export interface GlowOutputs {
  output: ImageRef;
}

export function glow(inputs: GlowInputs, options?: NodeOptions): NodeWithOutputs<GlowOutputs, "output"> {
  return createNode("lib.image.effects.Glow", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Add Blend — lib.image.effects.Add
export type AddInputs = {
  image?: Connectable<ImageRef>;
  over?: Connectable<ImageRef>;
  gain?: Connectable<number>;
};

export interface AddOutputs {
  output: ImageRef;
}

export function add(inputs: AddInputs, options?: NodeOptions): NodeWithOutputs<AddOutputs, "output"> {
  return createNode("lib.image.effects.Add", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}
