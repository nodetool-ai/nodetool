/**
 * Workflow nodes for `filters.*` modules in `@nodetool-ai/gpu/pool`,
 * executed via Dawn. Includes both single-pass shaders (blur, sharpen,
 * vignette, pixelate, threshold) and the `filters.glow` four-pass recipe.
 */

import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { NodeClass, PropOptions, ImageRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import * as d from "typegpu/data";
import {
  blurGaussianV1,
  sharpenUnsharpMaskV1,
  vignetteV1,
  filtersPixelateV1,
  filtersThresholdV1,
  filtersGlowV1
} from "@nodetool-ai/gpu/pool";
import {
  IMAGE_PROP,
  extraImageProp,
  floatProp,
  intProp,
  runShaderNode,
  runRecipeNode,
  type RunShaderOptions
} from "./lib-shader-utils.js";

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

interface ShaderSpec {
  nodeType: string;
  title: string;
  description: string;
  properties: Array<{ name: string; options: PropOptions }>;
  extraImageInputs?: ReadonlyArray<{ propName: string; bindName: string }>;
  /** Custom output sizing for `host-specified` / `derived` modules. */
  outputDims?: (props: Record<string, unknown>) => { width?: number; height?: number };
  buildParams: (props: Record<string, unknown>) => Record<string, unknown>;
  runner: (
    params: Record<string, unknown>,
    image: unknown,
    opts: RunShaderOptions,
    ctx?: ProcessingContext
  ) => Promise<ImageRef>;
}

function defineShaderNode(spec: ShaderSpec): NodeClass {
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
      const dims = spec.outputDims?.(props) ?? {};
      const params = spec.buildParams(props);
      const output = await spec.runner(params, props.image, {
        extraInputs: extras,
        outputWidth: dims.width,
        outputHeight: dims.height
      }, context);
      return { output };
    }
  };
  for (const entry of spec.properties) {
    registerDeclaredProperty(C, entry.name, entry.options);
  }
  return C as NodeClass;
}

/* ---- filters.blur.gaussian (recipe: H + V passes) ----------------- */
/**
 * The single-module blur dispatches one direction per call; a usable node
 * has to run both horizontal and vertical. We compose them here without a
 * separate recipe module: encode H into a scratch texture, then V into the
 * output.
 */
const BlurGaussianNode = defineShaderNode({
  nodeType: "shader.filters.blur",
  title: "Gaussian Blur",
  description: "Separable Gaussian blur (H then V pass, GPU).",
  properties: [
    { name: "image", options: IMAGE_PROP },
    { name: "radius", options: floatProp(4, { min: 0, max: 40, label: "Radius (px)" }) },
    { name: "sigma", options: floatProp(0, { min: 0, max: 16, label: "Sigma" }) }
  ],
  buildParams: (p) => ({
    radius: num(p.radius, 4),
    sigma: num(p.sigma, 0),
    direction: d.vec2f(1, 0)
  }),
  runner: async (params, image, opts, ctx) => {
    // Pass 1: horizontal blur → intermediate (raw RGBA via the helper).
    const horizontal = await runShaderNode(blurGaussianV1, params, image, opts, ctx);
    // Pass 2: vertical blur on the result.
    const verticalParams = { ...params, direction: d.vec2f(0, 1) };
    return runShaderNode(blurGaussianV1, verticalParams, horizontal, opts, ctx);
  }
});

/* ---- filters.sharpen.unsharpMask --------------------------------- */
const SharpenNode = defineShaderNode({
  nodeType: "shader.filters.sharpen",
  title: "Sharpen (Unsharp Mask)",
  description: "Unsharp-mask sharpening (GPU).",
  properties: [
    { name: "image", options: IMAGE_PROP },
    { name: "amount", options: floatProp(1, { min: 0, max: 4, label: "Amount" }) },
    { name: "threshold", options: floatProp(0, { min: 0, max: 1, label: "Threshold" }) }
  ],
  buildParams: (p) => ({
    amount: num(p.amount, 1),
    threshold: num(p.threshold, 0)
  }),
  runner: (params, image, opts, ctx) =>
    runShaderNode(sharpenUnsharpMaskV1, params, image, opts, ctx)
});

/* ---- filters.vignette -------------------------------------------- */
const VignetteNode = defineShaderNode({
  nodeType: "shader.filters.vignette",
  title: "Vignette",
  description: "Radial darkening around the image edges (GPU).",
  properties: [
    { name: "image", options: IMAGE_PROP },
    { name: "intensity", options: floatProp(0.5, { min: 0, max: 1, label: "Intensity" }) },
    { name: "radius", options: floatProp(0.75, { min: 0, max: 2, label: "Radius" }) },
    { name: "softness", options: floatProp(0.5, { min: 0, max: 1, label: "Softness" }) }
  ],
  buildParams: (p) => ({
    intensity: num(p.intensity, 0.5),
    radius: num(p.radius, 0.75),
    softness: num(p.softness, 0.5)
  }),
  runner: (params, image, opts, ctx) =>
    runShaderNode(vignetteV1, params, image, opts, ctx)
});

/* ---- filters.pixelate -------------------------------------------- */
const PixelateNode = defineShaderNode({
  nodeType: "shader.filters.pixelate",
  title: "Pixelate",
  description: "Average each NxN block to a single colour (GPU).",
  properties: [
    { name: "image", options: IMAGE_PROP },
    { name: "mask", options: extraImageProp("Mask", "Optional coverage mask") },
    { name: "block_size", options: intProp(8, { min: 1, max: 128, label: "Block size (px)" }) }
  ],
  extraImageInputs: [{ propName: "mask", bindName: "mask" }],
  buildParams: (p) => ({ cellSize: num(p.block_size, 8) }),
  runner: (params, image, opts, ctx) =>
    runShaderNode(filtersPixelateV1, params, image, opts, ctx)
});

/* ---- filters.threshold ------------------------------------------- */
const ThresholdNode = defineShaderNode({
  nodeType: "shader.filters.threshold",
  title: "Threshold",
  description: "Soft luminance threshold to bright pass (GPU).",
  properties: [
    { name: "image", options: IMAGE_PROP },
    { name: "threshold", options: floatProp(0.5, { min: 0, max: 1, label: "Threshold" }) },
    { name: "softness", options: floatProp(0.05, { min: 0, max: 0.5, label: "Softness" }) }
  ],
  buildParams: (p) => ({
    threshold: num(p.threshold, 0.5),
    softness: num(p.softness, 0.05)
  }),
  runner: (params, image, opts, ctx) =>
    runShaderNode(filtersThresholdV1, params, image, opts, ctx)
});

/* ---- filters.glow (recipe) --------------------------------------- */
const GlowNode = defineShaderNode({
  nodeType: "shader.filters.glow",
  title: "Glow",
  description:
    "Multi-pass glow: threshold → blur H → blur V → additive composite (GPU recipe).",
  properties: [
    { name: "image", options: IMAGE_PROP },
    { name: "threshold", options: floatProp(0.7, { min: 0, max: 1, label: "Threshold" }) },
    { name: "softness", options: floatProp(0.1, { min: 0, max: 0.5, label: "Softness" }) },
    { name: "radius", options: floatProp(8, { min: 0, max: 40, label: "Radius (px)" }) },
    { name: "intensity", options: floatProp(1, { min: 0, max: 4, label: "Intensity" }) }
  ],
  buildParams: (p) => ({
    threshold: num(p.threshold, 0.7),
    softness: num(p.softness, 0.1),
    radius: num(p.radius, 8),
    intensity: num(p.intensity, 1)
  }),
  runner: (params, image, opts, ctx) =>
    runRecipeNode(filtersGlowV1, params, image, opts, ctx)
});

export const SHADER_FILTERS_NODES: readonly NodeClass[] = [
  BlurGaussianNode,
  SharpenNode,
  VignetteNode,
  PixelateNode,
  ThresholdNode,
  GlowNode
];

export {
  BlurGaussianNode,
  SharpenNode,
  VignetteNode,
  PixelateNode,
  ThresholdNode,
  GlowNode
};
