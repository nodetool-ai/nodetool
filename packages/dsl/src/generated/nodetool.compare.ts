// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { ImageRef } from "../types.js";

// Compare Images — nodetool.compare.CompareImages
export interface CompareImagesInputs {
  image_a?: Connectable<ImageRef>;
  image_b?: Connectable<ImageRef>;
  label_a?: Connectable<string>;
  label_b?: Connectable<string>;
}

export function compareImages(inputs: CompareImagesInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.compare.CompareImages", inputs as Record<string, unknown>);
}
