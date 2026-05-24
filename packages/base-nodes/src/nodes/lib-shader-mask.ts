/**
 * Workflow nodes for `mask.*` modules: derive masks from an image, apply
 * masks to an image, invert a mask. All run via Dawn.
 */

import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { NodeClass, ImageRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
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
  static readonly nodeType = "shader.mask.apply";
  static readonly title = "Mask Apply";
  static readonly description =
    "Multiply mask coverage (mask.a) into the source's alpha; RGB unchanged (GPU).";
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
  static readonly nodeType = "shader.mask.from_image";
  static readonly title = "Mask From Image";
  static readonly description =
    "Derive a mask from an image channel: 0 alpha / 1 luma / 2 R / 3 G / 4 B / 5 max (GPU).";
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
registerDeclaredProperty(MaskFromImageNode, "mode", intProp(1, { min: 0, max: 5, label: "Mode" }));
registerDeclaredProperty(MaskFromImageNode, "invert", intProp(0, { min: 0, max: 1, label: "Invert" }));

class MaskInvertNode extends BaseNode {
  static readonly nodeType = "shader.mask.invert";
  static readonly title = "Mask Invert";
  static readonly description = "Invert mask alpha (coverage → 1 − coverage). GPU.";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    // The module declares a placeholder `unused` field; pass it to satisfy
    // the schema even though the WGSL never reads it.
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

export const SHADER_MASK_NODES: readonly NodeClass[] = [
  MaskApplyNode,
  MaskFromImageNode,
  MaskInvertNode
];
export { MaskApplyNode, MaskFromImageNode, MaskInvertNode };
