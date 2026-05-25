/**
 * `lib.image.color.*` — GPU-backed colour adjustment nodes wrapping the
 * published `color.*` shader modules from `@nodetool-ai/gpu/pool`. Single-pass
 * fragment ops (Invert, Brightness/Contrast, HSB, Posterize, ChannelSplit)
 * plus the compute-pass `color.grade` and `color.exposure` modules.
 */

import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { ImageRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { tagAsHybrid } from "../platform-tags.js";
import {
  colorInvertV1,
  colorBrightnessContrastV1,
  colorHsbV1,
  colorExposureV1,
  colorPosterizeV1,
  colorGradeV1,
  colorChannelSplitV1
} from "@nodetool-ai/gpu/pool";
import {
  IMAGE_PROP,
  extraImageProp,
  floatProp,
  intProp,
  runShaderNode
} from "./lib-shader-utils.js";

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

class InvertNode extends BaseNode {
  static readonly nodeType = "lib.image.color.Invert";
  static readonly title = "Invert";
  static readonly description =
    "Invert RGB (1 - rgb), preserve alpha. Amount fades between passthrough and full invert.\n    image, color, invert, negative";
  static readonly inputFields = ["image", "mask"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      colorInvertV1,
      { amount: num(props.amount, 1) },
      props.image,
      { extraInputs: { mask: props.mask } },
      context
    );
    return { output };
  }
}
registerDeclaredProperty(InvertNode, "image", IMAGE_PROP);
registerDeclaredProperty(InvertNode, "mask", extraImageProp("Mask", "Optional coverage mask"));
registerDeclaredProperty(InvertNode, "amount", floatProp(1, { min: 0, max: 1, label: "Amount" }));

class BrightnessContrastNode extends BaseNode {
  static readonly nodeType = "lib.image.color.BrightnessContrast";
  static readonly title = "Brightness / Contrast";
  static readonly description =
    "Additive brightness, multiplicative contrast around mid-gray.\n    image, color, brightness, contrast, levels";
  static readonly inputFields = ["image", "mask"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      colorBrightnessContrastV1,
      {
        brightness: num(props.brightness, 0),
        contrast: num(props.contrast, 1)
      },
      props.image,
      { extraInputs: { mask: props.mask } },
      context
    );
    return { output };
  }
}
registerDeclaredProperty(BrightnessContrastNode, "image", IMAGE_PROP);
registerDeclaredProperty(BrightnessContrastNode, "mask", extraImageProp("Mask", "Optional coverage mask"));
registerDeclaredProperty(
  BrightnessContrastNode,
  "brightness",
  floatProp(0, { min: -1, max: 1, label: "Brightness" })
);
registerDeclaredProperty(
  BrightnessContrastNode,
  "contrast",
  floatProp(1, { min: 0, max: 4, label: "Contrast" })
);

class HSBNode extends BaseNode {
  static readonly nodeType = "lib.image.color.HSB";
  static readonly title = "HSB";
  static readonly description =
    "Hue rotation (degrees), saturation and brightness multipliers.\n    image, color, hue, saturation, brightness, hsb, hsv";
  static readonly inputFields = ["image", "mask"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      colorHsbV1,
      {
        hue: num(props.hue, 0),
        saturation: num(props.saturation, 1),
        brightness: num(props.brightness, 1)
      },
      props.image,
      { extraInputs: { mask: props.mask } },
      context
    );
    return { output };
  }
}
registerDeclaredProperty(HSBNode, "image", IMAGE_PROP);
registerDeclaredProperty(HSBNode, "mask", extraImageProp("Mask", "Optional coverage mask"));
registerDeclaredProperty(HSBNode, "hue", floatProp(0, { min: -180, max: 180, label: "Hue (°)" }));
registerDeclaredProperty(HSBNode, "saturation", floatProp(1, { min: 0, max: 4, label: "Saturation" }));
registerDeclaredProperty(HSBNode, "brightness", floatProp(1, { min: 0, max: 4, label: "Brightness" }));

class ExposureNode extends BaseNode {
  static readonly nodeType = "lib.image.color.Exposure";
  static readonly title = "Exposure";
  static readonly description =
    "Adjust exposure in stops (rgb *= 2^stops).\n    image, color, exposure, stops, ev";
  static readonly inputFields = ["image", "mask"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      colorExposureV1,
      { stops: num(props.stops, 0) },
      props.image,
      { extraInputs: { mask: props.mask } },
      context
    );
    return { output };
  }
}
registerDeclaredProperty(ExposureNode, "image", IMAGE_PROP);
registerDeclaredProperty(ExposureNode, "mask", extraImageProp("Mask", "Optional coverage mask"));
registerDeclaredProperty(ExposureNode, "stops", floatProp(0, { min: -4, max: 4, label: "Stops" }));

class PosterizeNode extends BaseNode {
  static readonly nodeType = "lib.image.color.Posterize";
  static readonly title = "Posterize";
  static readonly description =
    "Quantize each channel to N levels.\n    image, color, posterize, quantize, levels";
  static readonly inputFields = ["image", "mask"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      colorPosterizeV1,
      { levels: num(props.levels, 4) },
      props.image,
      { extraInputs: { mask: props.mask } },
      context
    );
    return { output };
  }
}
registerDeclaredProperty(PosterizeNode, "image", IMAGE_PROP);
registerDeclaredProperty(PosterizeNode, "mask", extraImageProp("Mask", "Optional coverage mask"));
registerDeclaredProperty(PosterizeNode, "levels", intProp(4, { min: 2, max: 32, label: "Levels" }));

class GradeNode extends BaseNode {
  static readonly nodeType = "lib.image.color.Grade";
  static readonly title = "Color Grade";
  static readonly description =
    "Full colour-grade pass: brightness, contrast, saturation, hue, temperature, tint, shadows, highlights.\n    image, color, grade, color correction";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      colorGradeV1,
      {
        brightness: num(props.brightness, 0),
        contrast: num(props.contrast, 1),
        saturation: num(props.saturation, 1),
        hue: num(props.hue, 0),
        temperature: num(props.temperature, 0),
        tint: num(props.tint, 0),
        shadows: num(props.shadows, 0),
        highlights: num(props.highlights, 0)
      },
      props.image,
      {},
      context
    );
    return { output };
  }
}
registerDeclaredProperty(GradeNode, "image", IMAGE_PROP);
registerDeclaredProperty(GradeNode, "brightness", floatProp(0, { min: -1, max: 1, label: "Brightness" }));
registerDeclaredProperty(GradeNode, "contrast", floatProp(1, { min: 0, max: 4, label: "Contrast" }));
registerDeclaredProperty(GradeNode, "saturation", floatProp(1, { min: 0, max: 4, label: "Saturation" }));
registerDeclaredProperty(GradeNode, "hue", floatProp(0, { min: -180, max: 180, label: "Hue (°)" }));
registerDeclaredProperty(
  GradeNode,
  "temperature",
  floatProp(0, { min: -1, max: 1, label: "Temperature" })
);
registerDeclaredProperty(GradeNode, "tint", floatProp(0, { min: -1, max: 1, label: "Tint" }));
registerDeclaredProperty(GradeNode, "shadows", floatProp(0, { min: -1, max: 1, label: "Shadows" }));
registerDeclaredProperty(
  GradeNode,
  "highlights",
  floatProp(0, { min: -1, max: 1, label: "Highlights" })
);

class ChannelSplitNode extends BaseNode {
  static readonly nodeType = "lib.image.color.ChannelSplit";
  static readonly title = "Channel Split";
  static readonly description =
    "Extract a single channel (R/G/B/A) as a grayscale image, preserving alpha.\n    image, color, channel, split, isolate";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      colorChannelSplitV1,
      { mode: num(props.mode, 0) },
      props.image,
      {},
      context
    );
    return { output };
  }
}
registerDeclaredProperty(ChannelSplitNode, "image", IMAGE_PROP);
registerDeclaredProperty(
  ChannelSplitNode,
  "mode",
  intProp(0, { min: 0, max: 3, label: "Channel", notes: "0=R, 1=G, 2=B, 3=A" })
);

export const LIB_IMAGE_COLOR_NODES = tagAsHybrid([
  InvertNode,
  BrightnessContrastNode,
  HSBNode,
  ExposureNode,
  PosterizeNode,
  GradeNode,
  ChannelSplitNode
]);
export {
  InvertNode,
  BrightnessContrastNode,
  HSBNode,
  ExposureNode,
  PosterizeNode,
  GradeNode,
  ChannelSplitNode
};
