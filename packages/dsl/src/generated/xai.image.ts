// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Generate Image — xai.image.GenerateImage
export type GenerateImageInputs = {
  prompt?: Connectable<string>;
  model?: Connectable<string>;
};

export interface GenerateImageOutputs {
  output: ImageRef;
  revised_prompt: string;
}

export function generateImage(inputs: GenerateImageInputs): DslNode<GenerateImageOutputs> {
  return createNode("xai.image.GenerateImage", inputs, { outputNames: ["output", "revised_prompt"] });
}
