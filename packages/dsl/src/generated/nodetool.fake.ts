// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Fake Generate Image — nodetool.fake.GenerateImage
export type GenerateImageInputs = {
  prompt?: Connectable<string>;
  width?: Connectable<number>;
  height?: Connectable<number>;
};

export interface GenerateImageOutputs {
  output: ImageRef;
}

export function generateImage(inputs: GenerateImageInputs): DslNode<GenerateImageOutputs, "output"> {
  return createNode("nodetool.fake.GenerateImage", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Color Grade (browser) — nodetool.fake.ColorGrade
export type ColorGradeInputs = {
  image: Connectable<ImageRef>;
  hue?: Connectable<number>;
  saturation?: Connectable<number>;
  brightness?: Connectable<number>;
};

export interface ColorGradeOutputs {
  output: ImageRef;
}

export function colorGrade(inputs: ColorGradeInputs): DslNode<ColorGradeOutputs, "output"> {
  return createNode("nodetool.fake.ColorGrade", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
