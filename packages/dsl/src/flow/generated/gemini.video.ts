// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef, VideoRef } from "../../types.js";

// Text To Video — gemini.video.TextToVideo
export type TextToVideoInputs = {
  prompt?: string;
  model?: "veo-3.1-generate-preview" | "veo-3.1-fast-generate-preview" | "veo-3.1-lite-generate-preview";
  aspect_ratio?: "16:9" | "9:16";
  negative_prompt?: string;
  resolution?: "720p" | "1080p" | "4k";
};

export interface TextToVideoOutputs {
  output: VideoRef;
}

export function textToVideo(inputs: TextToVideoInputs): Promise<TextToVideoOutputs> {
  return callNode<TextToVideoOutputs>("gemini.video.TextToVideo", inputs);
}

// Image To Video — gemini.video.ImageToVideo
export type ImageToVideoInputs = {
  image?: ImageRef;
  prompt?: string;
  model?: "veo-3.1-generate-preview" | "veo-3.1-fast-generate-preview" | "veo-3.1-lite-generate-preview";
  aspect_ratio?: "16:9" | "9:16";
  negative_prompt?: string;
  resolution?: "720p" | "1080p" | "4k";
};

export interface ImageToVideoOutputs {
  output: VideoRef;
}

export function imageToVideo(inputs: ImageToVideoInputs): Promise<ImageToVideoOutputs> {
  return callNode<ImageToVideoOutputs>("gemini.video.ImageToVideo", inputs);
}
