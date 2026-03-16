// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { ImageRef } from "../types.js";

// Create Image — openai.image.CreateImage
export interface CreateImageInputs {
  prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  size?: Connectable<unknown>;
  background?: Connectable<unknown>;
  quality?: Connectable<unknown>;
}

export function createImage(inputs: CreateImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("openai.image.CreateImage", inputs as Record<string, unknown>);
}

// Edit Image — openai.image.EditImage
export interface EditImageInputs {
  image?: Connectable<ImageRef>;
  mask?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  size?: Connectable<unknown>;
  quality?: Connectable<unknown>;
}

export function editImage(inputs: EditImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("openai.image.EditImage", inputs as Record<string, unknown>);
}
