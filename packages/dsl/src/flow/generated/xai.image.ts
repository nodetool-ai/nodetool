// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Generate Image — xai.image.GenerateImage
export type GenerateImageInputs = {
  prompt?: string;
  model?: string;
};

export interface GenerateImageOutputs {
  output: ImageRef;
  revised_prompt: string;
}

export function generateImage(inputs: GenerateImageInputs): Promise<GenerateImageOutputs> {
  return callNode<GenerateImageOutputs>("xai.image.GenerateImage", inputs);
}
