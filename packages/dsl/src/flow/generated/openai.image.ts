// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Create Image — openai.image.CreateImage
export type CreateImageInputs = {
  prompt?: string;
  model?: "gpt-image-1";
  size?: "1024x1024" | "1536x1024" | "1024x1536";
  background?: "transparent" | "opaque" | "auto";
  quality?: "high" | "medium" | "low";
};

export interface CreateImageOutputs {
  output: ImageRef;
}

export function createImage(inputs: CreateImageInputs): Promise<CreateImageOutputs> {
  return callNode<CreateImageOutputs>("openai.image.CreateImage", inputs);
}

// Edit Image — openai.image.EditImage
export type EditImageInputs = {
  image?: ImageRef;
  mask?: ImageRef;
  prompt?: string;
  model?: "gpt-image-1";
  size?: "1024x1024" | "1536x1024" | "1024x1536";
  quality?: "high" | "medium" | "low";
};

export interface EditImageOutputs {
  output: ImageRef;
}

export function editImage(inputs: EditImageInputs): Promise<EditImageOutputs> {
  return callNode<EditImageOutputs>("openai.image.EditImage", inputs);
}

// Image Variation — openai.image.ImageVariation
export type ImageVariationInputs = {
  image?: ImageRef;
  size?: "256x256" | "512x512" | "1024x1024";
};

export interface ImageVariationOutputs {
  output: ImageRef;
}

export function imageVariation(inputs: ImageVariationInputs): Promise<ImageVariationOutputs> {
  return callNode<ImageVariationOutputs>("openai.image.ImageVariation", inputs);
}
