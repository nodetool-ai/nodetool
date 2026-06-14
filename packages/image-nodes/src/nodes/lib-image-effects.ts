/**
 * `lib.image.effects.*` — single-image layer effects (drop shadow, outline,
 * colour overlay, glow) plus additive composite. Backed by the GPU shader
 * pool (Dawn) — shaders are an implementation detail; nodes are organized by
 * what the user is doing.
 */

import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { ImageRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import * as d from "typegpu/data";
import { tagAsBrowserGpu, tagAsContentCard } from "@nodetool-ai/nodes-utils";
import {
  mixerAddV1,
  mixerColorOverlayV1,
  mixerOutlineV1,
  mixerDropShadowV1,
  filtersGlowV1
} from "@nodetool-ai/gpu/pool";
import {
  IMAGE_PROP,
  extraImageProp,
  colorProp,
  colorValueToVec4,
  floatProp,
  runShaderNode,
  runRecipeNode
} from "./lib-shader-utils.js";

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function vec4From(value: unknown, fallback: [number, number, number, number]): ReturnType<typeof d.vec4f> {
  const [r, g, b, a] = colorValueToVec4(value, fallback);
  return d.vec4f(r, g, b, a);
}

class ColorOverlayNode extends BaseNode {
  static readonly nodeType = "lib.image.effects.ColorOverlay";
  static readonly title = "Color Overlay";
  static readonly description =
    "Tint an image with a constant colour while preserving source coverage.\n    image, overlay, tint, layer effect";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      mixerColorOverlayV1,
      {
        color: vec4From(props.color, [1, 0, 0, 1]),
        amount: num(props.amount, 0.5)
      },
      props.image,
      {},
      context
    );
    return { output };
  }
}
registerDeclaredProperty(ColorOverlayNode, "image", IMAGE_PROP);
registerDeclaredProperty(ColorOverlayNode, "color", colorProp("#ff0000", { label: "Overlay color" }));
registerDeclaredProperty(ColorOverlayNode, "amount", floatProp(0.5, { min: 0, max: 1, label: "Amount" }));

class OutlineNode extends BaseNode {
  static readonly nodeType = "lib.image.effects.Outline";
  static readonly title = "Outline";
  static readonly description =
    "Draw a flat outline / stroke around the source silhouette.\n    image, outline, stroke, edge, layer effect";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      mixerOutlineV1,
      {
        color: vec4From(props.color, [0, 0, 0, 1]),
        widthPx: num(props.width, 2),
        threshold: num(props.threshold, 0.5)
      },
      props.image,
      {},
      context
    );
    return { output };
  }
}
registerDeclaredProperty(OutlineNode, "image", IMAGE_PROP);
registerDeclaredProperty(OutlineNode, "color", colorProp("#000000", { label: "Outline color" }));
registerDeclaredProperty(OutlineNode, "width", floatProp(2, { min: 0, max: 32, label: "Width (px)" }));
registerDeclaredProperty(OutlineNode, "threshold", floatProp(0.5, { min: 0, max: 1, label: "Alpha threshold" }));

class DropShadowNode extends BaseNode {
  static readonly nodeType = "lib.image.effects.DropShadow";
  static readonly title = "Drop Shadow";
  static readonly description =
    "Cast a soft drop shadow behind the source silhouette.\n    image, drop shadow, layer effect, blur";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runRecipeNode(
      mixerDropShadowV1,
      {
        color: vec4From(props.color, [0, 0, 0, 1]),
        offsetX: num(props.offset_x, 0.02),
        offsetY: num(props.offset_y, 0.02),
        radius: num(props.radius, 8),
        intensity: num(props.intensity, 0.6)
      },
      props.image,
      {},
      context
    );
    return { output };
  }
}
registerDeclaredProperty(DropShadowNode, "image", IMAGE_PROP);
registerDeclaredProperty(DropShadowNode, "color", colorProp("#000000", { label: "Shadow color" }));
registerDeclaredProperty(
  DropShadowNode,
  "offset_x",
  floatProp(0.02, { min: -0.5, max: 0.5, label: "Offset X" })
);
registerDeclaredProperty(
  DropShadowNode,
  "offset_y",
  floatProp(0.02, { min: -0.5, max: 0.5, label: "Offset Y" })
);
registerDeclaredProperty(
  DropShadowNode,
  "radius",
  floatProp(8, { min: 0, max: 40, label: "Radius (px)" })
);
registerDeclaredProperty(
  DropShadowNode,
  "intensity",
  floatProp(0.6, { min: 0, max: 4, label: "Intensity" })
);

class GlowNode extends BaseNode {
  static readonly nodeType = "lib.image.effects.Glow";
  static readonly title = "Glow";
  static readonly description =
    "Bloom / glow effect: bright-pass + blur + additive composite over source.\n    image, glow, bloom, layer effect, blur";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runRecipeNode(
      filtersGlowV1,
      {
        threshold: num(props.threshold, 0.7),
        softness: num(props.softness, 0.1),
        radius: num(props.radius, 8),
        intensity: num(props.intensity, 1)
      },
      props.image,
      {},
      context
    );
    return { output };
  }
}
registerDeclaredProperty(GlowNode, "image", IMAGE_PROP);
registerDeclaredProperty(GlowNode, "threshold", floatProp(0.7, { min: 0, max: 1, label: "Threshold" }));
registerDeclaredProperty(GlowNode, "softness", floatProp(0.1, { min: 0, max: 0.5, label: "Softness" }));
registerDeclaredProperty(GlowNode, "radius", floatProp(8, { min: 0, max: 40, label: "Radius (px)" }));
registerDeclaredProperty(GlowNode, "intensity", floatProp(1, { min: 0, max: 4, label: "Intensity" }));

class AddBlendNode extends BaseNode {
  static readonly nodeType = "lib.image.effects.Add";
  static readonly title = "Add Blend";
  static readonly description =
    "Additive composite of two images: out = source + over × gain.\n    image, add, blend, composite";
  static readonly inputFields = ["image", "over"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      mixerAddV1,
      { gain: num(props.gain, 1) },
      props.image,
      { extraInputs: { over: props.over } },
      context
    );
    return { output };
  }
}
registerDeclaredProperty(AddBlendNode, "image", IMAGE_PROP);
registerDeclaredProperty(AddBlendNode, "over", extraImageProp("Over", "Image added on top of the source"));
registerDeclaredProperty(AddBlendNode, "gain", floatProp(1, { min: 0, max: 4, label: "Gain" }));

export const LIB_IMAGE_EFFECTS_NODES = tagAsBrowserGpu(tagAsContentCard([
  ColorOverlayNode,
  OutlineNode,
  DropShadowNode,
  GlowNode,
  AddBlendNode
]));
export { ColorOverlayNode, OutlineNode, DropShadowNode, GlowNode, AddBlendNode };
