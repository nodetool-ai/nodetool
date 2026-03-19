// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Compare Images — nodetool.compare.CompareImages
export interface CompareImagesInputs {
  image_a?: Connectable<ImageRef>;
  image_b?: Connectable<ImageRef>;
  label_a?: Connectable<string>;
  label_b?: Connectable<string>;
}

export interface CompareImagesOutputs {
  output: unknown;
}

export function compareImages(inputs: CompareImagesInputs): DslNode<CompareImagesOutputs, "output"> {
  return createNode("nodetool.compare.CompareImages", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
