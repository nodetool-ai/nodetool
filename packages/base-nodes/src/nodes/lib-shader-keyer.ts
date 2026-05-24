/**
 * Workflow nodes for `keyer.*` modules. Both write the matte into the
 * alpha channel of the output — feed straight into `mask.apply` (the
 * `shader.mask.apply` node) for compositing.
 */

import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { NodeClass, ImageRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  chromaKeyV1,
  keyerLumaKeyV1
} from "@nodetool-ai/gpu/pool";
import {
  IMAGE_PROP,
  colorProp,
  colorValueToVec4,
  floatProp,
  runShaderNode
} from "./lib-shader-utils.js";
import * as d from "typegpu/data";

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

class ChromaKeyNode extends BaseNode {
  static readonly nodeType = "shader.keyer.chroma_key";
  static readonly title = "Chroma Key";
  static readonly description =
    "Knock out pixels close to a key colour, with despill (GPU).";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const [r, g, b] = colorValueToVec4(props.key_color, [0, 1, 0, 1]);
    const params = {
      keyColor: d.vec3f(r, g, b),
      tolerance: num(props.tolerance, 0.1),
      softness: num(props.softness, 0.05),
      spill: num(props.spill, 0.5)
    };
    const output = await runShaderNode(chromaKeyV1, params, props.image, {}, context);
    return { output };
  }
}
registerDeclaredProperty(ChromaKeyNode, "image", IMAGE_PROP);
registerDeclaredProperty(
  ChromaKeyNode,
  "key_color",
  colorProp("#00ff00", { label: "Key color" })
);
registerDeclaredProperty(
  ChromaKeyNode,
  "tolerance",
  floatProp(0.1, { min: 0, max: 1, label: "Tolerance" })
);
registerDeclaredProperty(
  ChromaKeyNode,
  "softness",
  floatProp(0.05, { min: 0, max: 1, label: "Softness" })
);
registerDeclaredProperty(
  ChromaKeyNode,
  "spill",
  floatProp(0.5, { min: 0, max: 1, label: "Spill suppression" })
);

class LumaKeyNode extends BaseNode {
  static readonly nodeType = "shader.keyer.luma_key";
  static readonly title = "Luma Key";
  static readonly description =
    "Keep pixels whose luminance falls inside [low, high] with smoothstep edges (GPU).";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const params = {
      low: num(props.low, 0),
      high: num(props.high, 1),
      softness: num(props.softness, 0.05)
    };
    const output = await runShaderNode(keyerLumaKeyV1, params, props.image, {}, context);
    return { output };
  }
}
registerDeclaredProperty(LumaKeyNode, "image", IMAGE_PROP);
registerDeclaredProperty(LumaKeyNode, "low", floatProp(0, { min: 0, max: 1, label: "Low" }));
registerDeclaredProperty(LumaKeyNode, "high", floatProp(1, { min: 0, max: 1, label: "High" }));
registerDeclaredProperty(
  LumaKeyNode,
  "softness",
  floatProp(0.05, { min: 0, max: 0.5, label: "Softness" })
);

export const SHADER_KEYER_NODES: readonly NodeClass[] = [ChromaKeyNode, LumaKeyNode];
export { ChromaKeyNode, LumaKeyNode };
