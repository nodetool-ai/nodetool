// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef, VideoRef } from "../types.js";

// Text To Video — gemini.video.TextToVideo
export type TextToVideoInputs = {
  prompt?: Connectable<string>;
  model?: Connectable<"veo-3.1-generate-preview" | "veo-3.1-fast-generate-preview" | "veo-3.1-lite-generate-preview">;
  aspect_ratio?: Connectable<"16:9" | "9:16">;
  negative_prompt?: Connectable<string>;
  resolution?: Connectable<"720p" | "1080p" | "4k">;
};

export interface TextToVideoOutputs {
  output: VideoRef;
}

export function textToVideo(inputs: TextToVideoInputs, options?: NodeOptions): NodeWithOutputs<TextToVideoOutputs, "output"> {
  return createNode("gemini.video.TextToVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
}

// Image To Video — gemini.video.ImageToVideo
export type ImageToVideoInputs = {
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  model?: Connectable<"veo-3.1-generate-preview" | "veo-3.1-fast-generate-preview" | "veo-3.1-lite-generate-preview">;
  aspect_ratio?: Connectable<"16:9" | "9:16">;
  negative_prompt?: Connectable<string>;
  resolution?: Connectable<"720p" | "1080p" | "4k">;
};

export interface ImageToVideoOutputs {
  output: VideoRef;
}

export function imageToVideo(inputs: ImageToVideoInputs, options?: NodeOptions): NodeWithOutputs<ImageToVideoOutputs, "output"> {
  return createNode("gemini.video.ImageToVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
}
