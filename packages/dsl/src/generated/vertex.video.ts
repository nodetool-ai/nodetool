// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef, VideoRef } from "../types.js";

// Text To Video — vertex.video.TextToVideo
export type TextToVideoInputs = {
  prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  aspect_ratio?: Connectable<"16:9" | "9:16">;
  negative_prompt?: Connectable<string>;
  resolution?: Connectable<"720p" | "1080p" | "4k">;
};

export interface TextToVideoOutputs {
  output: VideoRef;
}

export function textToVideo(inputs: TextToVideoInputs, options?: NodeOptions): NodeWithOutputs<TextToVideoOutputs, "output"> {
  return createNode("vertex.video.TextToVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
}

// Image To Video — vertex.video.ImageToVideo
export type ImageToVideoInputs = {
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  aspect_ratio?: Connectable<"16:9" | "9:16">;
  negative_prompt?: Connectable<string>;
  resolution?: Connectable<"720p" | "1080p" | "4k">;
};

export interface ImageToVideoOutputs {
  output: VideoRef;
}

export function imageToVideo(inputs: ImageToVideoInputs, options?: NodeOptions): NodeWithOutputs<ImageToVideoOutputs, "output"> {
  return createNode("vertex.video.ImageToVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
}
