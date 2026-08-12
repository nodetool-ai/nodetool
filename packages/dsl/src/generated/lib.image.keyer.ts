// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Chroma Key — lib.image.keyer.ChromaKey
export type ChromaKeyInputs = {
  image?: Connectable<ImageRef>;
  key_color?: Connectable<unknown>;
  tolerance?: Connectable<number>;
  softness?: Connectable<number>;
  spill?: Connectable<number>;
};

export interface ChromaKeyOutputs {
  output: ImageRef;
}

export function chromaKey(inputs: ChromaKeyInputs): DslNode<ChromaKeyOutputs, "output"> {
  return createNode("lib.image.keyer.ChromaKey", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Luma Key — lib.image.keyer.LumaKey
export type LumaKeyInputs = {
  image?: Connectable<ImageRef>;
  low?: Connectable<number>;
  high?: Connectable<number>;
  softness?: Connectable<number>;
};

export interface LumaKeyOutputs {
  output: ImageRef;
}

export function lumaKey(inputs: LumaKeyInputs): DslNode<LumaKeyOutputs, "output"> {
  return createNode("lib.image.keyer.LumaKey", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
