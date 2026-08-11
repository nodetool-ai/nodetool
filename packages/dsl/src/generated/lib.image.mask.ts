// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Apply Mask — lib.image.mask.Apply
export type ApplyInputs = {
  image?: Connectable<ImageRef>;
  mask?: Connectable<ImageRef>;
  invert?: Connectable<number>;
};

export interface ApplyOutputs {
  output: ImageRef;
}

export function apply(inputs: ApplyInputs): DslNode<ApplyOutputs, "output"> {
  return createNode("lib.image.mask.Apply", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Mask From Image — lib.image.mask.FromImage
export type FromImageInputs = {
  image?: Connectable<ImageRef>;
  mode?: Connectable<number>;
  invert?: Connectable<number>;
};

export interface FromImageOutputs {
  output: ImageRef;
}

export function fromImage(inputs: FromImageInputs): DslNode<FromImageOutputs, "output"> {
  return createNode("lib.image.mask.FromImage", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Invert Mask — lib.image.mask.Invert
export type InvertInputs = {
  image?: Connectable<ImageRef>;
};

export interface InvertOutputs {
  output: ImageRef;
}

export function invert(inputs: InvertInputs): DslNode<InvertOutputs, "output"> {
  return createNode("lib.image.mask.Invert", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
