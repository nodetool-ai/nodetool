// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Invert — lib.image.color.Invert
export type InvertInputs = {
  image?: Connectable<ImageRef>;
  mask?: Connectable<ImageRef>;
  amount?: Connectable<number>;
};

export interface InvertOutputs {
  output: ImageRef;
}

export function invert(inputs: InvertInputs): DslNode<InvertOutputs, "output"> {
  return createNode("lib.image.color.Invert", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Brightness / Contrast — lib.image.color.BrightnessContrast
export type BrightnessContrastInputs = {
  image?: Connectable<ImageRef>;
  mask?: Connectable<ImageRef>;
  brightness?: Connectable<number>;
  contrast?: Connectable<number>;
};

export interface BrightnessContrastOutputs {
  output: ImageRef;
}

export function brightnessContrast(inputs: BrightnessContrastInputs): DslNode<BrightnessContrastOutputs, "output"> {
  return createNode("lib.image.color.BrightnessContrast", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// HSB — lib.image.color.HSB
export type HSBInputs = {
  image?: Connectable<ImageRef>;
  mask?: Connectable<ImageRef>;
  hue?: Connectable<number>;
  saturation?: Connectable<number>;
  brightness?: Connectable<number>;
};

export interface HSBOutputs {
  output: ImageRef;
}

export function hsb(inputs: HSBInputs): DslNode<HSBOutputs, "output"> {
  return createNode("lib.image.color.HSB", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Exposure — lib.image.color.Exposure
export type ExposureInputs = {
  image?: Connectable<ImageRef>;
  mask?: Connectable<ImageRef>;
  stops?: Connectable<number>;
};

export interface ExposureOutputs {
  output: ImageRef;
}

export function exposure(inputs: ExposureInputs): DslNode<ExposureOutputs, "output"> {
  return createNode("lib.image.color.Exposure", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Posterize — lib.image.color.Posterize
export type PosterizeInputs = {
  image?: Connectable<ImageRef>;
  mask?: Connectable<ImageRef>;
  levels?: Connectable<number>;
};

export interface PosterizeOutputs {
  output: ImageRef;
}

export function posterize(inputs: PosterizeInputs): DslNode<PosterizeOutputs, "output"> {
  return createNode("lib.image.color.Posterize", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Color Grade — lib.image.color.Grade
export type GradeInputs = {
  image?: Connectable<ImageRef>;
  brightness?: Connectable<number>;
  contrast?: Connectable<number>;
  saturation?: Connectable<number>;
  hue?: Connectable<number>;
  temperature?: Connectable<number>;
  tint?: Connectable<number>;
  shadows?: Connectable<number>;
  highlights?: Connectable<number>;
};

export interface GradeOutputs {
  output: ImageRef;
}

export function grade(inputs: GradeInputs): DslNode<GradeOutputs, "output"> {
  return createNode("lib.image.color.Grade", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Channel Split — lib.image.color.ChannelSplit
export type ChannelSplitInputs = {
  image?: Connectable<ImageRef>;
  mode?: Connectable<number>;
};

export interface ChannelSplitOutputs {
  output: ImageRef;
}

export function channelSplit(inputs: ChannelSplitInputs): DslNode<ChannelSplitOutputs, "output"> {
  return createNode("lib.image.color.ChannelSplit", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
