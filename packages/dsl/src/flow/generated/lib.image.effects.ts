// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Color Overlay — lib.image.effects.ColorOverlay
export type ColorOverlayInputs = {
  image?: ImageRef;
  color?: unknown;
  amount?: number;
};

export interface ColorOverlayOutputs {
  output: ImageRef;
}

export function colorOverlay(inputs: ColorOverlayInputs): Promise<ColorOverlayOutputs> {
  return callNode<ColorOverlayOutputs>("lib.image.effects.ColorOverlay", inputs);
}

// Outline — lib.image.effects.Outline
export type OutlineInputs = {
  image?: ImageRef;
  color?: unknown;
  width?: number;
  threshold?: number;
};

export interface OutlineOutputs {
  output: ImageRef;
}

export function outline(inputs: OutlineInputs): Promise<OutlineOutputs> {
  return callNode<OutlineOutputs>("lib.image.effects.Outline", inputs);
}

// Drop Shadow — lib.image.effects.DropShadow
export type DropShadowInputs = {
  image?: ImageRef;
  color?: unknown;
  offset_x?: number;
  offset_y?: number;
  radius?: number;
  intensity?: number;
};

export interface DropShadowOutputs {
  output: ImageRef;
}

export function dropShadow(inputs: DropShadowInputs): Promise<DropShadowOutputs> {
  return callNode<DropShadowOutputs>("lib.image.effects.DropShadow", inputs);
}

// Glow — lib.image.effects.Glow
export type GlowInputs = {
  image?: ImageRef;
  threshold?: number;
  softness?: number;
  radius?: number;
  intensity?: number;
};

export interface GlowOutputs {
  output: ImageRef;
}

export function glow(inputs: GlowInputs): Promise<GlowOutputs> {
  return callNode<GlowOutputs>("lib.image.effects.Glow", inputs);
}

// Add Blend — lib.image.effects.Add
export type AddInputs = {
  image?: ImageRef;
  over?: ImageRef;
  gain?: number;
};

export interface AddOutputs {
  output: ImageRef;
}

export function add(inputs: AddInputs): Promise<AddOutputs> {
  return callNode<AddOutputs>("lib.image.effects.Add", inputs);
}
