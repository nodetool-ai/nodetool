/**
 * Additional `lib.image.filter.*` nodes that don't fit the PIL/sharp
 * factory pattern in `lib-image-filter.ts`: GPU-backed `Threshold` and
 * `Pixelate`. Grouped here so the descriptor-driven file stays focused on
 * its existing PIL family.
 */

import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { NodeClass, ImageRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  filtersPixelateV1,
  filtersThresholdV1
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

export const LIB_IMAGE_FILTER_EXTRAS_NODES: readonly NodeClass[] = [
  ThresholdNode,
  PixelateNode
];
export { ThresholdNode, PixelateNode };
