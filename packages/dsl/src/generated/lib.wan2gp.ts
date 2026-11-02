// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef, AudioRef, VideoRef } from "../types.js";

// Text To Video (Wan2GP) — lib.wan2gp.TextToVideo
export type TextToVideoInputs = {
  server_url?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_media_bytes?: Connectable<number>;
  seed?: Connectable<number>;
  negative_prompt?: Connectable<string>;
  width?: Connectable<number>;
  height?: Connectable<number>;
  num_frames?: Connectable<number>;
  fps?: Connectable<number>;
  num_inference_steps?: Connectable<number>;
  loras?: Connectable<string[]>;
  lora_multipliers?: Connectable<number[]>;
  prompt?: Connectable<string>;
  model_type?: Connectable<string>;
};

export interface TextToVideoOutputs {
  output: VideoRef;
}

export function textToVideo(inputs: TextToVideoInputs, options?: NodeOptions): NodeWithOutputs<TextToVideoOutputs, "output"> {
  return createNode("lib.wan2gp.TextToVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
}

// Image To Video (Wan2GP) — lib.wan2gp.ImageToVideo
export type ImageToVideoInputs = {
  server_url?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_media_bytes?: Connectable<number>;
  seed?: Connectable<number>;
  negative_prompt?: Connectable<string>;
  width?: Connectable<number>;
  height?: Connectable<number>;
  num_frames?: Connectable<number>;
  fps?: Connectable<number>;
  num_inference_steps?: Connectable<number>;
  loras?: Connectable<string[]>;
  lora_multipliers?: Connectable<number[]>;
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  model_type?: Connectable<string>;
};

export interface ImageToVideoOutputs {
  output: VideoRef;
}

export function imageToVideo(inputs: ImageToVideoInputs, options?: NodeOptions): NodeWithOutputs<ImageToVideoOutputs, "output"> {
  return createNode("lib.wan2gp.ImageToVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
}

// Generate (Wan2GP) — lib.wan2gp.Generate
export type GenerateInputs = {
  server_url?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_media_bytes?: Connectable<number>;
  seed?: Connectable<number>;
  model_type?: Connectable<string>;
  settings?: Connectable<Record<string, unknown>>;
  image?: Connectable<ImageRef>;
  image_end?: Connectable<ImageRef>;
  reference_images?: Connectable<ImageRef[]>;
  video?: Connectable<VideoRef>;
  video_mask?: Connectable<VideoRef>;
  source_video?: Connectable<VideoRef>;
  audio?: Connectable<AudioRef>;
  custom_file?: Connectable<unknown>;
  custom_file_name?: Connectable<string>;
};

export interface GenerateOutputs {
  output: ImageRef | VideoRef | AudioRef | unknown;
}

export function generate(inputs: GenerateInputs, options?: NodeOptions): NodeWithOutputs<GenerateOutputs, "output"> {
  return createNode("lib.wan2gp.Generate", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"union[image, video, audio, model_3d]"}, defaultOutput: "output" });
}

// List Models (Wan2GP) — lib.wan2gp.ListModels
export type ListModelsInputs = {
  server_url?: Connectable<string>;
  query?: Connectable<string>;
  main_output?: Connectable<"" | "video" | "image" | "audio" | "3d">;
  media_input?: Connectable<string>;
  capability?: Connectable<string>;
  limit?: Connectable<number>;
};

export interface ListModelsOutputs {
  output: Record<string, unknown>[];
}

export function listModels(inputs: ListModelsInputs, options?: NodeOptions): NodeWithOutputs<ListModelsOutputs, "output"> {
  return createNode("lib.wan2gp.ListModels", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[dict]"}, defaultOutput: "output" });
}
