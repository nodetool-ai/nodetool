// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Image Generation — gemini.image.ImageGeneration
export type ImageGenerationInputs = {
  prompt?: string;
  model?: "gemini-3.1-flash-image" | "gemini-3.1-flash-lite-image" | "gemini-3-pro-image" | "imagen-4.0-generate-001";
  image?: ImageRef;
  aspect_ratio?: "1:1" | "1:4" | "1:8" | "2:3" | "3:2" | "3:4" | "4:1" | "4:3" | "4:5" | "5:4" | "8:1" | "9:16" | "16:9" | "21:9";
  resolution?: "512px" | "1K" | "2K" | "4K";
};

export interface ImageGenerationOutputs {
  output: ImageRef;
}

export function imageGeneration(inputs: ImageGenerationInputs): Promise<ImageGenerationOutputs> {
  return callNode<ImageGenerationOutputs>("gemini.image.ImageGeneration", inputs);
}
