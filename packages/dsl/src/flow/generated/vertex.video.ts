// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef, VideoRef } from "../../types.js";

// Text To Video — vertex.video.TextToVideo
export type TextToVideoInputs = {
  prompt?: string;
  model?: unknown;
  aspect_ratio?: "16:9" | "9:16";
  negative_prompt?: string;
  resolution?: "720p" | "1080p" | "4k";
};

export interface TextToVideoOutputs {
  output: VideoRef;
}

export function textToVideo(inputs: TextToVideoInputs): Promise<TextToVideoOutputs> {
  return callNode<TextToVideoOutputs>("vertex.video.TextToVideo", inputs);
}

// Image To Video — vertex.video.ImageToVideo
export type ImageToVideoInputs = {
  image?: ImageRef;
  prompt?: string;
  model?: unknown;
  aspect_ratio?: "16:9" | "9:16";
  negative_prompt?: string;
  resolution?: "720p" | "1080p" | "4k";
};

export interface ImageToVideoOutputs {
  output: VideoRef;
}

export function imageToVideo(inputs: ImageToVideoInputs): Promise<ImageToVideoOutputs> {
  return callNode<ImageToVideoOutputs>("vertex.video.ImageToVideo", inputs);
}
