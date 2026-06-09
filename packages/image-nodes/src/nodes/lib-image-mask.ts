/**
 * `lib.image.mask.*` — mask manipulation: derive a mask from an image's
 * channels, apply a mask to an image, invert a mask. Coverage lives in the
 * alpha channel by convention. GPU-backed.
 */

import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { ImageRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { tagAsHybrid, tagAsContentCard } from "@nodetool-ai/nodes-utils";
import {
  maskApplyV1,
  maskFromImageV1,
  maskInvertV1
} from "@nodetool-ai/gpu/pool";
import {
  IMAGE_PROP,
  extraImageProp,
  intProp,
  runShaderNode
} from "./lib-shader-utils.js";

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

class MaskApplyNode extends BaseNode {
  static readonly nodeType = "lib.image.mask.Apply";
  static readonly title = "Apply Mask";
  static readonly description =
    "Multiply a coverage mask (read from mask.a) into the source's alpha. RGB unchanged.\n    image, mask, apply, alpha";
  static readonly inputFields = ["image", "mask"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      maskApplyV1,
      { invert: num(props.invert, 0) },
      props.image,
      { extraInputs: { mask: props.mask } },
      context
    );
    return { output };
  }
}
registerDeclaredProperty(MaskApplyNode, "image", IMAGE_PROP);
registerDeclaredProperty(MaskApplyNode, "mask", extraImageProp("Mask", "Coverage in alpha channel"));
registerDeclaredProperty(MaskApplyNode, "invert", intProp(0, { min: 0, max: 1, label: "Invert mask" }));

class MaskFromImageNode extends BaseNode {
  static readonly nodeType = "lib.image.mask.FromImage";
  static readonly title = "Mask From Image";
  static readonly description =
    "Derive a mask from an image channel.\n    image, mask, alpha, channel\n\n    Modes: 0 alpha / 1 luminance / 2 R / 3 G / 4 B / 5 max channel.";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      maskFromImageV1,
      { mode: num(props.mode, 1), invert: num(props.invert, 0) },
      props.image,
      {},
      context
    );
    return { output };
  }
}
registerDeclaredProperty(MaskFromImageNode, "image", IMAGE_PROP);
registerDeclaredProperty(MaskFromImageNode, "mode", intProp(1, { min: 0, max: 5, label: "Source channel" }));
registerDeclaredProperty(MaskFromImageNode, "invert", intProp(0, { min: 0, max: 1, label: "Invert" }));

class MaskInvertNode extends BaseNode {
  static readonly nodeType = "lib.image.mask.Invert";
  static readonly title = "Invert Mask";
  static readonly description = "Invert mask alpha (coverage → 1 − coverage).\n    image, mask, invert, alpha";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      maskInvertV1,
      { unused: 0 },
      props.image,
      {},
      context
    );
    return { output };
  }
}
registerDeclaredProperty(MaskInvertNode, "image", IMAGE_PROP);

export const LIB_IMAGE_MASK_NODES = tagAsHybrid(tagAsContentCard([
  MaskApplyNode,
  MaskFromImageNode,
  MaskInvertNode
]));
export { MaskApplyNode, MaskFromImageNode, MaskInvertNode };
