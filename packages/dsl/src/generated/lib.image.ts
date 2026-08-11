// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Mask — lib.image.Mask
export type MaskInputs = {
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
  mask?: Connectable<ImageRef>;
};

export interface MaskOutputs {
  output: ImageRef;
}

export function mask(inputs: MaskInputs): DslNode<MaskOutputs, "output"> {
  return createNode("lib.image.Mask", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
