// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
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

export function colorOverlay(inputs: ColorOverlayInputs): DslNode<ColorOverlayOutputs, "output"> {
  return createNode("lib.image.effects.ColorOverlay", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function outline(inputs: OutlineInputs): DslNode<OutlineOutputs, "output"> {
  return createNode("lib.image.effects.Outline", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function dropShadow(inputs: DropShadowInputs): DslNode<DropShadowOutputs, "output"> {
  return createNode("lib.image.effects.DropShadow", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function glow(inputs: GlowInputs): DslNode<GlowOutputs, "output"> {
  return createNode("lib.image.effects.Glow", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function add(inputs: AddInputs): DslNode<AddOutputs, "output"> {
  return createNode("lib.image.effects.Add", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
