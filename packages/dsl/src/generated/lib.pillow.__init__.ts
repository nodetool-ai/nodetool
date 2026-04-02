// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Blend — lib.pillow.__init__.Blend
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
    "lib.pillow.__init__.Blend",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Composite — lib.pillow.__init__.Composite
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
    "lib.pillow.__init__.Composite",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
