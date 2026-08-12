// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Create Image — openai.image.CreateImage
export type CreateImageInputs = {
  prompt?: Connectable<string>;
  model?: Connectable<"gpt-image-1">;
  size?: Connectable<"1024x1024" | "1536x1024" | "1024x1536">;
  background?: Connectable<"transparent" | "opaque" | "auto">;
  quality?: Connectable<"high" | "medium" | "low">;
};

export interface CreateImageOutputs {
  output: ImageRef;
}

export function createImage(inputs: CreateImageInputs): DslNode<CreateImageOutputs, "output"> {
  return createNode("openai.image.CreateImage", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Edit Image — openai.image.EditImage
export type EditImageInputs = {
  image?: Connectable<ImageRef>;
  mask?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  model?: Connectable<"gpt-image-1">;
  size?: Connectable<"1024x1024" | "1536x1024" | "1024x1536">;
  quality?: Connectable<"high" | "medium" | "low">;
};

export interface EditImageOutputs {
  output: ImageRef;
}

export function editImage(inputs: EditImageInputs): DslNode<EditImageOutputs, "output"> {
  return createNode("openai.image.EditImage", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Image Variation — openai.image.ImageVariation
export type ImageVariationInputs = {
  image?: Connectable<ImageRef>;
  size?: Connectable<"256x256" | "512x512" | "1024x1024">;
};

export interface ImageVariationOutputs {
  output: ImageRef;
}

export function imageVariation(inputs: ImageVariationInputs): DslNode<ImageVariationOutputs, "output"> {
  return createNode("openai.image.ImageVariation", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
