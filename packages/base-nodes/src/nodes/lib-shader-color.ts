/**
 * Workflow nodes for every `color.*` module in `@nodetool-ai/gpu/pool`,
 * executed server-side via the cached Dawn (`webgpu` npm) device.
 *
 * One node per module; the helper in {@link ./lib-shader-utils.ts} handles
 * decode → upload → encode → readback. Identity-by-default param sets mean
 * dropping any of these nodes onto a graph is a visual no-op until the user
 * dials a slider.
 */

import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { NodeClass, PropOptions, ImageRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  colorGradeV1,
  colorInvertV1,
  colorBrightnessContrastV1,
  colorHsbV1,
  colorExposureV1,
  colorPosterizeV1,
  colorChannelSplitV1,
  colorChannelShuffleV1,
  colorChannelMergeV1
} from "@nodetool-ai/gpu/pool";
import {
  IMAGE_PROP,
  extraImageProp,
  floatProp,
  intProp,
  runShaderNode
} from "./lib-shader-utils.js";

type PropEntry = { name: string; options: PropOptions };

interface ShaderNodeSpec {
  nodeType: string;
  title: string;
  description: string;
  properties: PropEntry[];
  /** Build the params object the shader expects from raw node props. */
  buildParams: (props: Record<string, unknown>) => Record<string, unknown>;
  /** Names of extra image inputs (other than `image`) the shader binds. */
  extraImageInputs?: ReadonlyArray<{ propName: string; bindName: string }>;
}

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function createColorShaderNode(spec: ShaderNodeSpec, runner: (params: Record<string, unknown>, image: unknown, extras: Record<string, unknown>, ctx?: ProcessingContext) => Promise<ImageRef>): NodeClass {
  const C = class extends BaseNode {
    static readonly nodeType = spec.nodeType;
    static readonly title = spec.title;
    static readonly description = spec.description;
    static readonly inputFields = [
      "image",
      ...(spec.extraImageInputs ?? []).map((e) => e.propName)
    ];
    static readonly metadataOutputTypes = { output: "image" };

    async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
      const props = this.serialize() as Record<string, unknown>;
      const extras: Record<string, unknown> = {};
      for (const { propName, bindName } of spec.extraImageInputs ?? []) {
        extras[bindName] = props[propName];
      }
      const params = spec.buildParams(props);
      const output = await runner(params, props.image, extras, context);
      return { output };
    }
  };

  for (const entry of spec.properties) {
    registerDeclaredProperty(C, entry.name, entry.options);
  }
  return C as NodeClass;
}

/** Wrapper that pins a `ShaderModule` and forwards through `runShaderNode`. */
function shaderRunner(module: Parameters<typeof runShaderNode>[0]) {
  return (
    params: Record<string, unknown>,
    image: unknown,
    extras: Record<string, unknown>,
    context?: ProcessingContext
  ) => runShaderNode(module, params, image, { extraInputs: extras }, context);
}

/* ---- color.grade --------------------------------------------------- */
const ColorGradeNode = createColorShaderNode(
  {
    nodeType: "shader.color.grade",
    title: "Color Grade",
    description: "Brightness / contrast / saturation / hue / temperature / tint / shadows / highlights (GPU).",
    properties: [
      { name: "image", options: IMAGE_PROP },
      { name: "brightness", options: floatProp(0, { min: -1, max: 1, label: "Brightness" }) },
      { name: "contrast", options: floatProp(1, { min: 0, max: 4, label: "Contrast" }) },
      { name: "saturation", options: floatProp(1, { min: 0, max: 4, label: "Saturation" }) },
      { name: "hue", options: floatProp(0, { min: -180, max: 180, label: "Hue (°)" }) },
      { name: "temperature", options: floatProp(0, { min: -1, max: 1, label: "Temperature" }) },
      { name: "tint", options: floatProp(0, { min: -1, max: 1, label: "Tint" }) },
      { name: "shadows", options: floatProp(0, { min: -1, max: 1, label: "Shadows" }) },
      { name: "highlights", options: floatProp(0, { min: -1, max: 1, label: "Highlights" }) }
    ],
    buildParams: (p) => ({
      brightness: num(p.brightness, 0),
      contrast: num(p.contrast, 1),
      saturation: num(p.saturation, 1),
      hue: num(p.hue, 0),
      temperature: num(p.temperature, 0),
      tint: num(p.tint, 0),
      shadows: num(p.shadows, 0),
      highlights: num(p.highlights, 0)
    })
  },
  shaderRunner(colorGradeV1)
);

/* ---- color.invert -------------------------------------------------- */
const ColorInvertNode = createColorShaderNode(
  {
    nodeType: "shader.color.invert",
    title: "Color Invert",
    description: "Invert RGB (GPU). Optional mask blends the effect.",
    properties: [
      { name: "image", options: IMAGE_PROP },
      { name: "mask", options: extraImageProp("Mask", "Optional coverage mask (alpha channel)") },
      { name: "amount", options: floatProp(1, { min: 0, max: 1, label: "Amount" }) }
    ],
    extraImageInputs: [{ propName: "mask", bindName: "mask" }],
    buildParams: (p) => ({ amount: num(p.amount, 1) })
  },
  shaderRunner(colorInvertV1)
);

/* ---- color.brightnessContrast ------------------------------------- */
const ColorBrightnessContrastNode = createColorShaderNode(
  {
    nodeType: "shader.color.brightness_contrast",
    title: "Brightness / Contrast",
    description: "Additive brightness, multiplicative contrast around 0.5 (GPU).",
    properties: [
      { name: "image", options: IMAGE_PROP },
      { name: "mask", options: extraImageProp("Mask", "Optional coverage mask") },
      { name: "brightness", options: floatProp(0, { min: -1, max: 1, label: "Brightness" }) },
      { name: "contrast", options: floatProp(1, { min: 0, max: 4, label: "Contrast" }) }
    ],
    extraImageInputs: [{ propName: "mask", bindName: "mask" }],
    buildParams: (p) => ({
      brightness: num(p.brightness, 0),
      contrast: num(p.contrast, 1)
    })
  },
  shaderRunner(colorBrightnessContrastV1)
);

/* ---- color.hsb ----------------------------------------------------- */
const ColorHsbNode = createColorShaderNode(
  {
    nodeType: "shader.color.hsb",
    title: "Hue / Saturation / Brightness",
    description: "HSB shift in degrees + multiplicative S/B (GPU).",
    properties: [
      { name: "image", options: IMAGE_PROP },
      { name: "mask", options: extraImageProp("Mask", "Optional coverage mask") },
      { name: "hue", options: floatProp(0, { min: -180, max: 180, label: "Hue (°)" }) },
      { name: "saturation", options: floatProp(1, { min: 0, max: 4, label: "Saturation" }) },
      { name: "brightness", options: floatProp(1, { min: 0, max: 4, label: "Brightness" }) }
    ],
    extraImageInputs: [{ propName: "mask", bindName: "mask" }],
    buildParams: (p) => ({
      hue: num(p.hue, 0),
      saturation: num(p.saturation, 1),
      brightness: num(p.brightness, 1)
    })
  },
  shaderRunner(colorHsbV1)
);

/* ---- color.exposure ----------------------------------------------- */
const ColorExposureNode = createColorShaderNode(
  {
    nodeType: "shader.color.exposure",
    title: "Exposure",
    description: "Multiplicative exposure in stops (rgb *= 2^stops). GPU, SDR-clamped.",
    properties: [
      { name: "image", options: IMAGE_PROP },
      { name: "mask", options: extraImageProp("Mask", "Optional coverage mask") },
      { name: "stops", options: floatProp(0, { min: -4, max: 4, label: "Stops" }) }
    ],
    extraImageInputs: [{ propName: "mask", bindName: "mask" }],
    buildParams: (p) => ({ stops: num(p.stops, 0) })
  },
  shaderRunner(colorExposureV1)
);

/* ---- color.posterize ---------------------------------------------- */
const ColorPosterizeNode = createColorShaderNode(
  {
    nodeType: "shader.color.posterize",
    title: "Posterize",
    description: "Quantize each channel to N levels (GPU).",
    properties: [
      { name: "image", options: IMAGE_PROP },
      { name: "mask", options: extraImageProp("Mask", "Optional coverage mask") },
      { name: "levels", options: intProp(4, { min: 2, max: 32, label: "Levels" }) }
    ],
    extraImageInputs: [{ propName: "mask", bindName: "mask" }],
    buildParams: (p) => ({ levels: num(p.levels, 4) })
  },
  shaderRunner(colorPosterizeV1)
);

/* ---- color.channelSplit ------------------------------------------- */
const ColorChannelSplitNode = createColorShaderNode(
  {
    nodeType: "shader.color.channel_split",
    title: "Channel Split",
    description: "Output one channel of the source as opaque grayscale (GPU). 0 R / 1 G / 2 B / 3 A / 4 luma.",
    properties: [
      { name: "image", options: IMAGE_PROP },
      { name: "mode", options: intProp(0, { min: 0, max: 4, label: "Channel" }) }
    ],
    buildParams: (p) => ({ mode: num(p.mode, 0) })
  },
  shaderRunner(colorChannelSplitV1)
);

/* ---- color.channelShuffle ----------------------------------------- */
const ColorChannelShuffleNode = createColorShaderNode(
  {
    nodeType: "shader.color.channel_shuffle",
    title: "Channel Shuffle",
    description: "Permute RGBA channels — each output channel picks any input channel (GPU).",
    properties: [
      { name: "image", options: IMAGE_PROP },
      { name: "r_from", options: intProp(0, { min: 0, max: 3, label: "R from" }) },
      { name: "g_from", options: intProp(1, { min: 0, max: 3, label: "G from" }) },
      { name: "b_from", options: intProp(2, { min: 0, max: 3, label: "B from" }) },
      { name: "a_from", options: intProp(3, { min: 0, max: 3, label: "A from" }) }
    ],
    buildParams: (p) => ({
      rFrom: num(p.r_from, 0),
      gFrom: num(p.g_from, 1),
      bFrom: num(p.b_from, 2),
      aFrom: num(p.a_from, 3)
    })
  },
  shaderRunner(colorChannelShuffleV1)
);

/* ---- color.channelMerge ------------------------------------------- */
const ColorChannelMergeNode = createColorShaderNode(
  {
    nodeType: "shader.color.channel_merge",
    title: "Channel Merge",
    description: "Take RGB from one image and alpha (selectable channel) from another (GPU).",
    properties: [
      { name: "image", options: IMAGE_PROP },
      {
        name: "alpha",
        options: extraImageProp("Alpha source", "Image whose channel provides the new alpha")
      },
      {
        name: "alpha_channel",
        options: intProp(3, { min: 0, max: 4, label: "Alpha channel" })
      }
    ],
    extraImageInputs: [{ propName: "alpha", bindName: "alpha" }],
    buildParams: (p) => ({ alphaChannel: num(p.alpha_channel, 3) })
  },
  shaderRunner(colorChannelMergeV1)
);

export const SHADER_COLOR_NODES: readonly NodeClass[] = [
  ColorGradeNode,
  ColorInvertNode,
  ColorBrightnessContrastNode,
  ColorHsbNode,
  ColorExposureNode,
  ColorPosterizeNode,
  ColorChannelSplitNode,
  ColorChannelShuffleNode,
  ColorChannelMergeNode
];

export {
  ColorGradeNode,
  ColorInvertNode,
  ColorBrightnessContrastNode,
  ColorHsbNode,
  ColorExposureNode,
  ColorPosterizeNode,
  ColorChannelSplitNode,
  ColorChannelShuffleNode,
  ColorChannelMergeNode
};
