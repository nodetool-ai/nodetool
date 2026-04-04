// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Create Image — openai.image.CreateImage
export interface CreateImageInputs {
  prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  size?: Connectable<unknown>;
  background?: Connectable<unknown>;
  quality?: Connectable<unknown>;
}

export interface CreateImageOutputs {
  output: ImageRef;
}

export function createImage(
  inputs: CreateImageInputs
): DslNode<CreateImageOutputs, "output"> {
  return createNode(
    "openai.image.CreateImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export interface EditImageOutputs {
  output: ImageRef;
}

export function editImage(
  inputs: EditImageInputs
): DslNode<EditImageOutputs, "output"> {
  return createNode(
    "openai.image.EditImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
