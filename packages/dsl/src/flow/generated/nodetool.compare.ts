// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Compare Images — nodetool.compare.CompareImages
export type CompareImagesInputs = {
  image_a?: ImageRef;
  image_b?: ImageRef;
  label_a?: string;
  label_b?: string;
};

export interface CompareImagesOutputs {
  comparison: unknown;
  score: number;
  equal: boolean;
}

export function compareImages(inputs: CompareImagesInputs): Promise<CompareImagesOutputs> {
  return callNode<CompareImagesOutputs>("nodetool.compare.CompareImages", inputs);
}
