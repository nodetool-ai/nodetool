// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Generate Image (stable-diffusion.cpp) — lib.stable_diffusion_cpp.GenerateImage
export type GenerateImageInputs = {
  endpoint?: string;
  prompt?: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg_scale?: number;
  seed?: number;
  count?: number;
  sampler?: string;
  scheduler?: string;
  image?: ImageRef;
  mask?: ImageRef;
  reference_images?: ImageRef[];
  strength?: number;
  parameters?: Record<string, unknown>;
  timeout?: number;
};

export interface GenerateImageOutputs {
  output: ImageRef;
  images: ImageRef[];
}

export function generateImage(inputs: GenerateImageInputs): Promise<GenerateImageOutputs> {
  return callNode<GenerateImageOutputs>("lib.stable_diffusion_cpp.GenerateImage", inputs);
}
