// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Fake Generate Image — nodetool.fake.GenerateImage
export type GenerateImageInputs = {
  prompt?: string;
  width?: number;
  height?: number;
};

export interface GenerateImageOutputs {
  output: ImageRef;
}

export function generateImage(inputs: GenerateImageInputs): Promise<GenerateImageOutputs> {
  return callNode<GenerateImageOutputs>("nodetool.fake.GenerateImage", inputs);
}

// Color Grade (browser) — nodetool.fake.ColorGrade
export type ColorGradeInputs = {
  image: ImageRef;
  hue?: number;
  saturation?: number;
  brightness?: number;
};

export interface ColorGradeOutputs {
  output: ImageRef;
}

export function colorGrade(inputs: ColorGradeInputs): Promise<ColorGradeOutputs> {
  return callNode<ColorGradeOutputs>("nodetool.fake.ColorGrade", inputs);
}
