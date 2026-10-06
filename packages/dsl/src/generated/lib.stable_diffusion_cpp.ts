// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef } from "../types.js";

// Generate Image (stable-diffusion.cpp) — lib.stable_diffusion_cpp.GenerateImage
export type GenerateImageInputs = {
  endpoint?: Connectable<string>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  width?: Connectable<number>;
  height?: Connectable<number>;
  steps?: Connectable<number>;
  cfg_scale?: Connectable<number>;
  seed?: Connectable<number>;
  count?: Connectable<number>;
  sampler?: Connectable<string>;
  scheduler?: Connectable<string>;
  image?: Connectable<ImageRef>;
  mask?: Connectable<ImageRef>;
  reference_images?: Connectable<ImageRef[]>;
  strength?: Connectable<number>;
  parameters?: Connectable<Record<string, unknown>>;
  timeout?: Connectable<number>;
};

export interface GenerateImageOutputs {
  output: ImageRef;
  images: ImageRef[];
}

export function generateImage(inputs: GenerateImageInputs, options?: NodeOptions): NodeWithOutputs<GenerateImageOutputs> {
  return createNode("lib.stable_diffusion_cpp.GenerateImage", inputs, { id: options?.id, outputNames: ["output", "images"], outputTypes: {"output":"image","images":"list[image]"} });
}
