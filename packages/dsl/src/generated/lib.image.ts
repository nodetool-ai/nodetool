// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Blend — lib.image.Blend
export interface BlendInputs {
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
  alpha?: Connectable<number>;
}

export interface BlendOutputs {
  output: ImageRef;
}

export function blend(inputs: BlendInputs): DslNode<BlendOutputs, "output"> {
  return createNode(
    "lib.image.Blend",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Composite — lib.image.Composite
export interface CompositeInputs {
  image1?: Connectable<ImageRef>;
  image2?: Connectable<ImageRef>;
  mask?: Connectable<ImageRef>;
}

export interface CompositeOutputs {
  output: ImageRef;
}

export function composite(
  inputs: CompositeInputs
): DslNode<CompositeOutputs, "output"> {
  return createNode(
    "lib.image.Composite",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
