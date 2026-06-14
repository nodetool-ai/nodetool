/**
 * Additional `lib.image.filter.*` nodes that don't fit the PIL/sharp
 * factory pattern in `lib-image-filter.ts`: GPU-backed `Threshold`,
 * `Pixelate`, `GaussianBlur`, `UnsharpMask`, `Vignette`. Grouped here so the
 * descriptor-driven file stays focused on its existing PIL family.
 */

import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { ImageRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { tagAsBrowserGpu, tagAsContentCard } from "@nodetool-ai/nodes-utils";
import {
  filtersPixelateV1,
  filtersThresholdV1,
  filtersBlurSeparableV1,
  sharpenUnsharpMaskV1,
  vignetteV1
} from "@nodetool-ai/gpu/pool";
import {
  IMAGE_PROP,
  extraImageProp,
  floatProp,
  intProp,
  runShaderNode,
  runRecipeNode
} from "./lib-shader-utils.js";

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

class ThresholdNode extends BaseNode {
  static readonly nodeType = "lib.image.filter.Threshold";
  static readonly title = "Threshold";
  static readonly description =
    "Smoothstep luminance threshold — keeps pixels above the cutoff, fades around it.\n    image, threshold, brightpass, filter";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      filtersThresholdV1,
      {
        threshold: num(props.threshold, 0.5),
        softness: num(props.softness, 0.05)
      },
      props.image,
      {},
      context
    );
    return { output };
  }
}
registerDeclaredProperty(ThresholdNode, "image", IMAGE_PROP);
registerDeclaredProperty(ThresholdNode, "threshold", floatProp(0.5, { min: 0, max: 1, label: "Threshold" }));
registerDeclaredProperty(ThresholdNode, "softness", floatProp(0.05, { min: 0, max: 0.5, label: "Softness" }));

class PixelateNode extends BaseNode {
  static readonly nodeType = "lib.image.filter.Pixelate";
  static readonly title = "Pixelate";
  static readonly description =
    "Average each N×N block to a single colour.\n    image, pixelate, mosaic, filter";
  static readonly inputFields = ["image", "mask"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      filtersPixelateV1,
      { cellSize: num(props.cell_size, 8) },
      props.image,
      { extraInputs: { mask: props.mask } },
      context
    );
    return { output };
  }
}
registerDeclaredProperty(PixelateNode, "image", IMAGE_PROP);
registerDeclaredProperty(PixelateNode, "mask", extraImageProp("Mask", "Optional coverage mask"));
registerDeclaredProperty(PixelateNode, "cell_size", intProp(8, { min: 1, max: 128, label: "Cell size (px)" }));

class GaussianBlurNode extends BaseNode {
  static readonly nodeType = "lib.image.filter.GaussianBlur";
  static readonly title = "Gaussian Blur";
  static readonly description =
    "Separable two-pass gaussian blur (horizontal then vertical).\n    image, blur, gaussian, smooth, filter";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runRecipeNode(
      filtersBlurSeparableV1,
      {
        radius: num(props.radius, 4),
        sigma: num(props.sigma, 0)
      },
      props.image,
      {},
      context
    );
    return { output };
  }
}
registerDeclaredProperty(GaussianBlurNode, "image", IMAGE_PROP);
registerDeclaredProperty(
  GaussianBlurNode,
  "radius",
  floatProp(4, { min: 0, max: 64, label: "Radius (px)" })
);
registerDeclaredProperty(
  GaussianBlurNode,
  "sigma",
  floatProp(0, { min: 0, max: 32, label: "Sigma", notes: "0 = derived from radius" })
);

class UnsharpMaskNode extends BaseNode {
  static readonly nodeType = "lib.image.filter.UnsharpMask";
  static readonly title = "Unsharp Mask";
  static readonly description =
    "Sharpening via local-contrast boost. Amount controls strength, threshold suppresses noise.\n    image, sharpen, unsharp mask, filter, detail";
  static readonly inputFields = ["image", "mask"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      sharpenUnsharpMaskV1,
      {
        amount: num(props.amount, 1),
        threshold: num(props.threshold, 0)
      },
      props.image,
      { extraInputs: { mask: props.mask } },
      context
    );
    return { output };
  }
}
registerDeclaredProperty(UnsharpMaskNode, "image", IMAGE_PROP);
registerDeclaredProperty(UnsharpMaskNode, "mask", extraImageProp("Mask", "Optional coverage mask"));
registerDeclaredProperty(
  UnsharpMaskNode,
  "amount",
  floatProp(1, { min: 0, max: 4, label: "Amount" })
);
registerDeclaredProperty(
  UnsharpMaskNode,
  "threshold",
  floatProp(0, { min: 0, max: 1, label: "Threshold" })
);

class VignetteNode extends BaseNode {
  static readonly nodeType = "lib.image.filter.Vignette";
  static readonly title = "Vignette";
  static readonly description =
    "Radial darkening around the frame corners. Negative intensity brightens edges.\n    image, vignette, filter, lens";
  static readonly inputFields = ["image", "mask"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      vignetteV1,
      {
        intensity: num(props.intensity, 0.5),
        radius: num(props.radius, 0.9),
        softness: num(props.softness, 0.5)
      },
      props.image,
      { extraInputs: { mask: props.mask } },
      context
    );
    return { output };
  }
}
registerDeclaredProperty(VignetteNode, "image", IMAGE_PROP);
registerDeclaredProperty(VignetteNode, "mask", extraImageProp("Mask", "Optional coverage mask"));
registerDeclaredProperty(
  VignetteNode,
  "intensity",
  floatProp(0.5, { min: -1, max: 1, label: "Intensity" })
);
registerDeclaredProperty(
  VignetteNode,
  "radius",
  floatProp(0.9, { min: 0, max: 2, label: "Radius" })
);
registerDeclaredProperty(
  VignetteNode,
  "softness",
  floatProp(0.5, { min: 0, max: 1, label: "Softness" })
);

export const LIB_IMAGE_FILTER_EXTRAS_NODES = tagAsBrowserGpu(tagAsContentCard([
  ThresholdNode,
  PixelateNode,
  GaussianBlurNode,
  UnsharpMaskNode,
  VignetteNode
]));
export {
  ThresholdNode,
  PixelateNode,
  GaussianBlurNode,
  UnsharpMaskNode,
  VignetteNode
};
