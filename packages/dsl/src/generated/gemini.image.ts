// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Image Generation — gemini.image.ImageGeneration
export interface ImageGenerationInputs {
  prompt?: Connectable<string>;
  model?: Connectable<"gemini-3.1-flash-image" | "gemini-3.1-flash-lite-image" | "gemini-3-pro-image" | "imagen-4.0-generate-001">;
  image?: Connectable<ImageRef>;
  aspect_ratio?: Connectable<"1:1" | "1:4" | "1:8" | "2:3" | "3:2" | "3:4" | "4:1" | "4:3" | "4:5" | "5:4" | "8:1" | "9:16" | "16:9" | "21:9">;
  resolution?: Connectable<"512px" | "1K" | "2K" | "4K">;
}

export interface ImageGenerationOutputs {
  output: ImageRef;
}

export function imageGeneration(inputs: ImageGenerationInputs): DslNode<ImageGenerationOutputs, "output"> {
  return createNode("gemini.image.ImageGeneration", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
