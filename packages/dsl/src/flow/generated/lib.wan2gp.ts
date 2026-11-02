// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef, AudioRef, VideoRef } from "../../types.js";

// Text To Video (Wan2GP) — lib.wan2gp.TextToVideo
export type TextToVideoInputs = {
  server_url?: string;
  timeout_seconds?: number;
  max_media_bytes?: number;
  seed?: number;
  negative_prompt?: string;
  width?: number;
  height?: number;
  num_frames?: number;
  fps?: number;
  num_inference_steps?: number;
  loras?: string[];
  lora_multipliers?: number[];
  prompt?: string;
  model_type?: string;
};

export interface TextToVideoOutputs {
  output: VideoRef;
}

export function textToVideo(inputs: TextToVideoInputs): Promise<TextToVideoOutputs> {
  return callNode<TextToVideoOutputs>("lib.wan2gp.TextToVideo", inputs);
}

// Image To Video (Wan2GP) — lib.wan2gp.ImageToVideo
export type ImageToVideoInputs = {
  server_url?: string;
  timeout_seconds?: number;
  max_media_bytes?: number;
  seed?: number;
  negative_prompt?: string;
  width?: number;
  height?: number;
  num_frames?: number;
  fps?: number;
  num_inference_steps?: number;
  loras?: string[];
  lora_multipliers?: number[];
  image?: ImageRef;
  prompt?: string;
  model_type?: string;
};

export interface ImageToVideoOutputs {
  output: VideoRef;
}

export function imageToVideo(inputs: ImageToVideoInputs): Promise<ImageToVideoOutputs> {
  return callNode<ImageToVideoOutputs>("lib.wan2gp.ImageToVideo", inputs);
}

// Generate (Wan2GP) — lib.wan2gp.Generate
export type GenerateInputs = {
  server_url?: string;
  timeout_seconds?: number;
  max_media_bytes?: number;
  seed?: number;
  model_type?: string;
  settings?: Record<string, unknown>;
  image?: ImageRef;
  image_end?: ImageRef;
  reference_images?: ImageRef[];
  video?: VideoRef;
  video_mask?: VideoRef;
  source_video?: VideoRef;
  audio?: AudioRef;
  custom_file?: unknown;
  custom_file_name?: string;
};

export interface GenerateOutputs {
  output: ImageRef | VideoRef | AudioRef | unknown;
}

export function generate(inputs: GenerateInputs): Promise<GenerateOutputs> {
  return callNode<GenerateOutputs>("lib.wan2gp.Generate", inputs);
}

// List Models (Wan2GP) — lib.wan2gp.ListModels
export type ListModelsInputs = {
  server_url?: string;
  query?: string;
  main_output?: "" | "video" | "image" | "audio" | "3d";
  media_input?: string;
  capability?: string;
  limit?: number;
};

export interface ListModelsOutputs {
  output: Record<string, unknown>[];
}

export function listModels(inputs: ListModelsInputs): Promise<ListModelsOutputs> {
  return callNode<ListModelsOutputs>("lib.wan2gp.ListModels", inputs);
}
