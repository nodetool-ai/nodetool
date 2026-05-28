/**
 * `lib.image.draw.*` generator nodes — zero-input image sources beyond the
 * solid `Background` (which lives in `lib-image-draw.ts`). Linear / radial /
 * angular / diamond gradients and a checkerboard pattern, all GPU-backed.
 */

import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { ImageRef, PropOptions } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import * as d from "typegpu/data";
import { tagAsHybrid } from "@nodetool-ai/nodes-utils";
import {
  sourcesLinearGradientV1,
  sourcesCheckerboardV1,
  sourcesRadialGradientV1,
  sourcesAngularGradientV1,
  sourcesDiamondGradientV1
} from "@nodetool-ai/gpu/pool";
import {
  colorProp,
  colorValueToVec4,
  floatProp,
  intProp,
  premultiplyVec4,
  runShaderNode
} from "./lib-shader-utils.js";

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Generator shader colour params are declared premultiplied (matches the
 * pool's between-modules invariant) and the WGSL returns them via
 * `mix(...)` / direct assignment without re-premultiplying. The colour
 * picker emits straight alpha, so we premultiply on the boundary —
 * otherwise translucent gradient stops would brighten the RGB channels.
 */
function vec4From(value: unknown, fallback: [number, number, number, number]): ReturnType<typeof d.vec4f> {
  const [r, g, b, a] = premultiplyVec4(colorValueToVec4(value, fallback));
  return d.vec4f(r, g, b, a);
}

const WIDTH_PROP: PropOptions = { type: "int", default: 512, title: "Width", min: 1, max: 4096 };
const HEIGHT_PROP: PropOptions = { type: "int", default: 512, title: "Height", min: 1, max: 4096 };

class LinearGradientNode extends BaseNode {
  static readonly nodeType = "lib.image.draw.LinearGradient";
  static readonly title = "Linear Gradient";
  static readonly description =
    "Two-stop linear gradient with angle and midpoint.\n    image, gradient, linear, draw";
  static readonly inputFields: string[] = [];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const width = num(props.width, 512);
    const height = num(props.height, 512);
    const output = await runShaderNode(
      sourcesLinearGradientV1,
      {
        colorA: vec4From(props.color_a, [0, 0, 0, 1]),
        colorB: vec4From(props.color_b, [1, 1, 1, 1]),
        angle: num(props.angle, 0),
        midpoint: num(props.midpoint, 0.5)
      },
      null,
      { outputWidth: width, outputHeight: height },
      context
    );
    return { output };
  }
}
registerDeclaredProperty(LinearGradientNode, "width", WIDTH_PROP);
registerDeclaredProperty(LinearGradientNode, "height", HEIGHT_PROP);
registerDeclaredProperty(LinearGradientNode, "color_a", colorProp("#000000", { label: "Color A" }));
registerDeclaredProperty(LinearGradientNode, "color_b", colorProp("#ffffff", { label: "Color B" }));
registerDeclaredProperty(LinearGradientNode, "angle", floatProp(0, { min: -180, max: 180, label: "Angle (°)" }));
registerDeclaredProperty(LinearGradientNode, "midpoint", floatProp(0.5, { min: 0, max: 1, label: "Midpoint" }));

class RadialGradientNode extends BaseNode {
  static readonly nodeType = "lib.image.draw.RadialGradient";
  static readonly title = "Radial Gradient";
  static readonly description =
    "Inner-to-outer radial gradient centred on the canvas.\n    image, gradient, radial, draw";
  static readonly inputFields: string[] = [];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const width = num(props.width, 512);
    const height = num(props.height, 512);
    const output = await runShaderNode(
      sourcesRadialGradientV1,
      {
        colorInner: vec4From(props.color_inner, [1, 1, 1, 1]),
        colorOuter: vec4From(props.color_outer, [0, 0, 0, 1]),
        radius: num(props.radius, 0.5)
      },
      null,
      { outputWidth: width, outputHeight: height },
      context
    );
    return { output };
  }
}
registerDeclaredProperty(RadialGradientNode, "width", WIDTH_PROP);
registerDeclaredProperty(RadialGradientNode, "height", HEIGHT_PROP);
registerDeclaredProperty(RadialGradientNode, "color_inner", colorProp("#ffffff", { label: "Inner color" }));
registerDeclaredProperty(RadialGradientNode, "color_outer", colorProp("#000000", { label: "Outer color" }));
registerDeclaredProperty(RadialGradientNode, "radius", floatProp(0.5, { min: 0, max: 2, label: "Radius" }));

class AngularGradientNode extends BaseNode {
  static readonly nodeType = "lib.image.draw.AngularGradient";
  static readonly title = "Angular Gradient";
  static readonly description =
    "Sweep gradient around the canvas centre.\n    image, gradient, angular, conic, draw";
  static readonly inputFields: string[] = [];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const width = num(props.width, 512);
    const height = num(props.height, 512);
    const output = await runShaderNode(
      sourcesAngularGradientV1,
      {
        colorA: vec4From(props.color_a, [0, 0, 0, 1]),
        colorB: vec4From(props.color_b, [1, 1, 1, 1]),
        rotation: num(props.rotation, 0)
      },
      null,
      { outputWidth: width, outputHeight: height },
      context
    );
    return { output };
  }
}
registerDeclaredProperty(AngularGradientNode, "width", WIDTH_PROP);
registerDeclaredProperty(AngularGradientNode, "height", HEIGHT_PROP);
registerDeclaredProperty(AngularGradientNode, "color_a", colorProp("#000000", { label: "Color A" }));
registerDeclaredProperty(AngularGradientNode, "color_b", colorProp("#ffffff", { label: "Color B" }));
registerDeclaredProperty(AngularGradientNode, "rotation", floatProp(0, { min: -180, max: 180, label: "Rotation (°)" }));

class DiamondGradientNode extends BaseNode {
  static readonly nodeType = "lib.image.draw.DiamondGradient";
  static readonly title = "Diamond Gradient";
  static readonly description =
    "Inner-to-outer diamond / square gradient.\n    image, gradient, diamond, draw";
  static readonly inputFields: string[] = [];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const width = num(props.width, 512);
    const height = num(props.height, 512);
    const output = await runShaderNode(
      sourcesDiamondGradientV1,
      {
        colorInner: vec4From(props.color_inner, [1, 1, 1, 1]),
        colorOuter: vec4From(props.color_outer, [0, 0, 0, 1]),
        radius: num(props.radius, 0.5)
      },
      null,
      { outputWidth: width, outputHeight: height },
      context
    );
    return { output };
  }
}
registerDeclaredProperty(DiamondGradientNode, "width", WIDTH_PROP);
registerDeclaredProperty(DiamondGradientNode, "height", HEIGHT_PROP);
registerDeclaredProperty(DiamondGradientNode, "color_inner", colorProp("#ffffff", { label: "Inner color" }));
registerDeclaredProperty(DiamondGradientNode, "color_outer", colorProp("#000000", { label: "Outer color" }));
registerDeclaredProperty(DiamondGradientNode, "radius", floatProp(0.5, { min: 0, max: 2, label: "Radius" }));

class CheckerboardNode extends BaseNode {
  static readonly nodeType = "lib.image.draw.Checkerboard";
  static readonly title = "Checkerboard";
  static readonly description =
    "Two-color checkerboard with configurable cell size.\n    image, checkerboard, pattern, draw";
  static readonly inputFields: string[] = [];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const width = num(props.width, 512);
    const height = num(props.height, 512);
    const output = await runShaderNode(
      sourcesCheckerboardV1,
      {
        colorA: vec4From(props.color_a, [1, 1, 1, 1]),
        colorB: vec4From(props.color_b, [0, 0, 0, 1]),
        cellSize: num(props.cell_size, 32)
      },
      null,
      { outputWidth: width, outputHeight: height },
      context
    );
    return { output };
  }
}
registerDeclaredProperty(CheckerboardNode, "width", WIDTH_PROP);
registerDeclaredProperty(CheckerboardNode, "height", HEIGHT_PROP);
registerDeclaredProperty(CheckerboardNode, "color_a", colorProp("#ffffff", { label: "Color A" }));
registerDeclaredProperty(CheckerboardNode, "color_b", colorProp("#000000", { label: "Color B" }));
registerDeclaredProperty(CheckerboardNode, "cell_size", intProp(32, { min: 1, max: 512, label: "Cell size (px)" }));

export const LIB_IMAGE_GENERATORS_NODES = tagAsHybrid([
  LinearGradientNode,
  RadialGradientNode,
  AngularGradientNode,
  DiamondGradientNode,
  CheckerboardNode
]);

export {
  LinearGradientNode,
  RadialGradientNode,
  AngularGradientNode,
  DiamondGradientNode,
  CheckerboardNode
};
