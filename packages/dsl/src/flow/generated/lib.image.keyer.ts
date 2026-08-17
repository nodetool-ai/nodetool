// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Chroma Key — lib.image.keyer.ChromaKey
export type ChromaKeyInputs = {
  image?: ImageRef;
  key_color?: unknown;
  tolerance?: number;
  softness?: number;
  spill?: number;
};

export interface ChromaKeyOutputs {
  output: ImageRef;
}

export function chromaKey(inputs: ChromaKeyInputs): Promise<ChromaKeyOutputs> {
  return callNode<ChromaKeyOutputs>("lib.image.keyer.ChromaKey", inputs);
}

// Luma Key — lib.image.keyer.LumaKey
export type LumaKeyInputs = {
  image?: ImageRef;
  low?: number;
  high?: number;
  softness?: number;
};

export interface LumaKeyOutputs {
  output: ImageRef;
}

export function lumaKey(inputs: LumaKeyInputs): Promise<LumaKeyOutputs> {
  return callNode<LumaKeyOutputs>("lib.image.keyer.LumaKey", inputs);
}
