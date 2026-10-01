// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
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

export function generateImage(inputs: GenerateImageInputs, options?: NodeOptions): NodeWithOutputs<GenerateImageOutputs> {
  return createNode("xai.image.GenerateImage", inputs, { id: options?.id, outputNames: ["output", "revised_prompt"], outputTypes: {"output":"image","revised_prompt":"str"} });
}
