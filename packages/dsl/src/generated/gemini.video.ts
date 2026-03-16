// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { ImageRef, VideoRef } from "../types.js";

// Text To Video — gemini.video.TextToVideo
export interface TextToVideoInputs {
  prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  aspect_ratio?: Connectable<unknown>;
  negative_prompt?: Connectable<string>;
}

export function textToVideo(inputs: TextToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("gemini.video.TextToVideo", inputs as Record<string, unknown>);
}

// Image To Video — gemini.video.ImageToVideo
export interface ImageToVideoInputs {
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  aspect_ratio?: Connectable<unknown>;
  negative_prompt?: Connectable<string>;
}

export function imageToVideo(inputs: ImageToVideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("gemini.video.ImageToVideo", inputs as Record<string, unknown>);
}
