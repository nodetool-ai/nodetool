// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
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

export function compareImages(inputs: CompareImagesInputs, options?: NodeOptions): NodeWithOutputs<CompareImagesOutputs> {
  return createNode("nodetool.compare.CompareImages", inputs, { id: options?.id, outputNames: ["comparison", "score", "equal"], outputTypes: {"comparison":"any","score":"float","equal":"bool"} });
}
