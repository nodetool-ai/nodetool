// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { ImageRef } from "../types.js";

// Image Generation — gemini.image.ImageGeneration
export interface ImageGenerationInputs {
  prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
}

export function imageGeneration(inputs: ImageGenerationInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("gemini.image.ImageGeneration", inputs as Record<string, unknown>);
}
