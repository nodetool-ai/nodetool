/**
 * Workflow nodes for `mixer.*` modules: add (two-input additive composite),
 * colorOverlay (constant tint), outline (alpha-edge fill), and the
 * dropShadow recipe. The internal `mixer.shadowCompose` helper is not
 * exposed — workflow users compose drop shadows through the recipe node.
 */

import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { NodeClass, ImageRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import * as d from "typegpu/data";
import {
  mixerAddV1,
  mixerColorOverlayV1,
  mixerOutlineV1,
  mixerDropShadowV1
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

class MixerAddNode extends BaseNode {
  static readonly nodeType = "shader.mixer.add";
  static readonly title = "Add";
  static readonly description = "Additive composite: out = source + over * gain (GPU).";
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
registerDeclaredProperty(MixerAddNode, "image", IMAGE_PROP);
registerDeclaredProperty(MixerAddNode, "over", extraImageProp("Over", "Image added on top"));
registerDeclaredProperty(MixerAddNode, "gain", floatProp(1, { min: 0, max: 4, label: "Gain" }));

class ColorOverlayNode extends BaseNode {
  static readonly nodeType = "shader.mixer.color_overlay";
  static readonly title = "Color Overlay";
  static readonly description =
    "Tint with a constant colour while preserving source coverage (GPU).";
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
registerDeclaredProperty(
  ColorOverlayNode,
  "amount",
  floatProp(0.5, { min: 0, max: 1, label: "Amount" })
);

class OutlineNode extends BaseNode {
  static readonly nodeType = "shader.mixer.outline";
  static readonly title = "Outline";
  static readonly description = "Flat outline / stroke around the source silhouette (GPU).";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      mixerOutlineV1,
      {
        color: vec4From(props.color, [0, 0, 0, 1]),
        widthPx: num(props.width_px, 2),
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
registerDeclaredProperty(
  OutlineNode,
  "width_px",
  floatProp(2, { min: 0, max: 32, label: "Width (px)" })
);
registerDeclaredProperty(
  OutlineNode,
  "threshold",
  floatProp(0.5, { min: 0, max: 1, label: "Alpha threshold" })
);

class DropShadowNode extends BaseNode {
  static readonly nodeType = "shader.mixer.drop_shadow";
  static readonly title = "Drop Shadow";
  static readonly description =
    "Drop-shadow layer effect (mask.fromImage → blur H → blur V → composite). GPU recipe.";
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

export const SHADER_MIXER_NODES: readonly NodeClass[] = [
  MixerAddNode,
  ColorOverlayNode,
  OutlineNode,
  DropShadowNode
];
export { MixerAddNode, ColorOverlayNode, OutlineNode, DropShadowNode };
