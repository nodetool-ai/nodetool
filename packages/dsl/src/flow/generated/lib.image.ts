// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Mask — lib.image.Mask
export type MaskInputs = {
  image1?: ImageRef;
  image2?: ImageRef;
  mask?: ImageRef;
};

export interface MaskOutputs {
  output: ImageRef;
}

export function mask(inputs: MaskInputs): Promise<MaskOutputs> {
  return callNode<MaskOutputs>("lib.image.Mask", inputs);
}
