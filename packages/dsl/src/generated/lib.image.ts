// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
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

export function mask(inputs: MaskInputs, options?: NodeOptions): NodeWithOutputs<MaskOutputs, "output"> {
  return createNode("lib.image.Mask", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}
