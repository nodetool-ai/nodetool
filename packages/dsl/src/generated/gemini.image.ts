// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Image Generation — gemini.image.ImageGeneration
export interface ImageGenerationInputs {
  prompt?: Connectable<string>;
  model?: Connectable<"gemini-2.0-flash-preview-image-generation" | "gemini-2.5-flash-image-preview" | "gemini-3-pro-image-preview" | "imagen-3.0-generate-001" | "imagen-3.0-generate-002" | "imagen-4.0-generate-001">;
  image?: Connectable<ImageRef>;
}

export interface ImageGenerationOutputs {
  output: ImageRef;
}

export function imageGeneration(inputs: ImageGenerationInputs): DslNode<ImageGenerationOutputs, "output"> {
  return createNode("gemini.image.ImageGeneration", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
