// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Compare Images — nodetool.compare.CompareImages
export type CompareImagesInputs = {
  image_a?: Connectable<ImageRef>;
  image_b?: Connectable<ImageRef>;
  label_a?: Connectable<string>;
  label_b?: Connectable<string>;
};

export interface CompareImagesOutputs {
  comparison: unknown;
  score: number;
  equal: boolean;
}

export function compareImages(inputs: CompareImagesInputs): DslNode<CompareImagesOutputs> {
  return createNode("nodetool.compare.CompareImages", inputs, { outputNames: ["comparison", "score", "equal"] });
}
