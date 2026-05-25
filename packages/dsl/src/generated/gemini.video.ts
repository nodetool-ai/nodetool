// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, VideoRef } from "../types.js";

// Text To Video — gemini.video.TextToVideo
export interface TextToVideoInputs {
  prompt?: Connectable<string>;
  model?: Connectable<"veo-3.1-generate-preview" | "veo-2.0-generate-001">;
  aspect_ratio?: Connectable<"16:9" | "9:16">;
  negative_prompt?: Connectable<string>;
}

export interface TextToVideoOutputs {
  output: VideoRef;
}

export function textToVideo(inputs: TextToVideoInputs): DslNode<TextToVideoOutputs, "output"> {
  return createNode("gemini.video.TextToVideo", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Image To Video — gemini.video.ImageToVideo
export interface ImageToVideoInputs {
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  model?: Connectable<"veo-3.1-generate-preview" | "veo-2.0-generate-001">;
  aspect_ratio?: Connectable<"16:9" | "9:16">;
  negative_prompt?: Connectable<string>;
}

export interface ImageToVideoOutputs {
  output: VideoRef;
}

export function imageToVideo(inputs: ImageToVideoInputs): DslNode<ImageToVideoOutputs, "output"> {
  return createNode("gemini.video.ImageToVideo", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
