/**
 * `lib.image.keyer.*` — chroma/luma keying. Knock out pixels matching a key
 * colour (chroma) or inside a luminance band (luma). GPU-backed.
 */

import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { ImageRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import * as d from "typegpu/data";
import { chromaKeyV1, keyerLumaKeyV1 } from "@nodetool-ai/gpu/pool";
import { tagAsBrowserGpu, tagAsContentCard } from "@nodetool-ai/nodes-utils";
import {
  IMAGE_PROP,
  colorProp,
  colorValueToVec4,
  floatProp,
  runShaderNode
} from "./lib-shader-utils.js";

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

class ChromaKeyNode extends BaseNode {
  static readonly nodeType = "lib.image.keyer.ChromaKey";
  static readonly title = "Chroma Key";
  static readonly description =
    "Knock out pixels close to a key colour, with optional spill suppression.\n    image, chroma key, green screen, keying";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const [r, g, b] = colorValueToVec4(props.key_color, [0, 1, 0, 1]);
    const output = await runShaderNode(
      chromaKeyV1,
      {
        keyColor: d.vec3f(r, g, b),
        tolerance: num(props.tolerance, 0.1),
        softness: num(props.softness, 0.05),
        spill: num(props.spill, 0.5)
      },
      props.image,
      {},
      context
    );
    return { output };
  }
}
registerDeclaredProperty(ChromaKeyNode, "image", IMAGE_PROP);
registerDeclaredProperty(ChromaKeyNode, "key_color", colorProp("#00ff00", { label: "Key color" }));
registerDeclaredProperty(ChromaKeyNode, "tolerance", floatProp(0.1, { min: 0, max: 1, label: "Tolerance" }));
registerDeclaredProperty(ChromaKeyNode, "softness", floatProp(0.05, { min: 0, max: 1, label: "Softness" }));
registerDeclaredProperty(ChromaKeyNode, "spill", floatProp(0.5, { min: 0, max: 1, label: "Spill suppression" }));

class LumaKeyNode extends BaseNode {
  static readonly nodeType = "lib.image.keyer.LumaKey";
  static readonly title = "Luma Key";
  static readonly description =
    "Keep pixels whose luminance falls inside [low, high] with smoothstep edges.\n    image, luma key, keying, brightness";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      keyerLumaKeyV1,
      {
        low: num(props.low, 0),
        high: num(props.high, 1),
        softness: num(props.softness, 0.05)
      },
      props.image,
      {},
      context
    );
    return { output };
  }
}
registerDeclaredProperty(LumaKeyNode, "image", IMAGE_PROP);
registerDeclaredProperty(LumaKeyNode, "low", floatProp(0, { min: 0, max: 1, label: "Low" }));
registerDeclaredProperty(LumaKeyNode, "high", floatProp(1, { min: 0, max: 1, label: "High" }));
registerDeclaredProperty(LumaKeyNode, "softness", floatProp(0.05, { min: 0, max: 0.5, label: "Softness" }));

export const LIB_IMAGE_KEYER_NODES = tagAsBrowserGpu(
  tagAsContentCard([ChromaKeyNode, LumaKeyNode])
);
export { ChromaKeyNode, LumaKeyNode };
