// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Apply Mask — lib.image.mask.Apply
export type ApplyInputs = {
  image?: ImageRef;
  mask?: ImageRef;
  invert?: number;
};

export interface ApplyOutputs {
  output: ImageRef;
}

export function apply(inputs: ApplyInputs): Promise<ApplyOutputs> {
  return callNode<ApplyOutputs>("lib.image.mask.Apply", inputs);
}

// Mask From Image — lib.image.mask.FromImage
export type FromImageInputs = {
  image?: ImageRef;
  mode?: number;
  invert?: number;
};

export interface FromImageOutputs {
  output: ImageRef;
}

export function fromImage(inputs: FromImageInputs): Promise<FromImageOutputs> {
  return callNode<FromImageOutputs>("lib.image.mask.FromImage", inputs);
}

// Invert Mask — lib.image.mask.Invert
export type InvertInputs = {
  image?: ImageRef;
};

export interface InvertOutputs {
  output: ImageRef;
}

export function invert(inputs: InvertInputs): Promise<InvertOutputs> {
  return callNode<InvertOutputs>("lib.image.mask.Invert", inputs);
}
