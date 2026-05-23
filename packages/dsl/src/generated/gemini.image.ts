// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Image Generation — gemini.image.ImageGeneration
export interface ImageGenerationInputs {
  prompt?: Connectable<string>;
  model?: Connectable<"gemini-3.1-flash-image-preview" | "imagen-4.0-generate-001">;
  image?: Connectable<ImageRef>;
}

export interface ImageGenerationOutputs {
  output: ImageRef;
}

export function imageGeneration(inputs: ImageGenerationInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ImageGenerationOutputs, "output"> {
  return createNode("gemini.image.ImageGeneration", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
