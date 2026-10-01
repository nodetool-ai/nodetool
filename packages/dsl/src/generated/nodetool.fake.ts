// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
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

export function generateImage(inputs: GenerateImageInputs, options?: NodeOptions): NodeWithOutputs<GenerateImageOutputs, "output"> {
  return createNode("nodetool.fake.GenerateImage", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
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

export function colorGrade(inputs: ColorGradeInputs, options?: NodeOptions): NodeWithOutputs<ColorGradeOutputs, "output"> {
  return createNode("nodetool.fake.ColorGrade", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}
