/**
 * Workflow nodes for `sources.*` modules — zero-input generators. Every
 * node carries `width`/`height` props so the host can allocate the target
 * texture at the requested resolution (the modules' `io.output.dimensions`
 * is `host-specified`).
 */

import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { NodeClass, ImageRef, PropOptions } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import * as d from "typegpu/data";
import {
  sourcesSolidV1,
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
  runShaderNode
} from "./lib-shader-utils.js";

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function vec4From(value: unknown, fallback: [number, number, number, number]): ReturnType<typeof d.vec4f> {
  const [r, g, b, a] = colorValueToVec4(value, fallback);
  return d.vec4f(r, g, b, a);
}

interface SourceSpec {
  nodeType: string;
  title: string;
  description: string;
  module: Parameters<typeof runShaderNode>[0];
  extraProps: Array<{ name: string; options: PropOptions }>;
  buildParams: (props: Record<string, unknown>) => Record<string, unknown>;
}

const WIDTH_PROP: PropOptions = {
  type: "int",
  default: 512,
  title: "Width",
  min: 1,
  max: 4096
};
const HEIGHT_PROP: PropOptions = {
  type: "int",
  default: 512,
  title: "Height",
  min: 1,
  max: 4096
};

function defineSourceNode(spec: SourceSpec): NodeClass {
  const C = class extends BaseNode {
    static readonly nodeType = spec.nodeType;
    static readonly title = spec.title;
    static readonly description = spec.description;
    static readonly inputFields: string[] = [];
    static readonly metadataOutputTypes = { output: "image" };

    async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
      const props = this.serialize() as Record<string, unknown>;
      const width = num(props.width, 512);
      const height = num(props.height, 512);
      const params = spec.buildParams(props);
      const output = await runShaderNode(
        spec.module,
        params,
        null,
        { outputWidth: width, outputHeight: height },
        context
      );
      return { output };
    }
  };
  registerDeclaredProperty(C, "width", WIDTH_PROP);
  registerDeclaredProperty(C, "height", HEIGHT_PROP);
  for (const entry of spec.extraProps) {
    registerDeclaredProperty(C, entry.name, entry.options);
  }
  return C as NodeClass;
}

const SolidNode = defineSourceNode({
  nodeType: "shader.sources.solid",
  title: "Solid Color",
  description: "Fill the output with a single RGBA color (GPU).",
  module: sourcesSolidV1,
  extraProps: [{ name: "color", options: colorProp("#000000", { label: "Color" }) }],
  buildParams: (p) => ({ color: vec4From(p.color, [0, 0, 0, 1]) })
});

const LinearGradientNode = defineSourceNode({
  nodeType: "shader.sources.linear_gradient",
  title: "Linear Gradient",
  description: "Two-stop linear gradient with angle + midpoint (GPU).",
  module: sourcesLinearGradientV1,
  extraProps: [
    { name: "color_a", options: colorProp("#000000", { label: "Color A" }) },
    { name: "color_b", options: colorProp("#ffffff", { label: "Color B" }) },
    { name: "angle", options: floatProp(0, { min: -180, max: 180, label: "Angle (°)" }) },
    { name: "midpoint", options: floatProp(0.5, { min: 0, max: 1, label: "Midpoint" }) }
  ],
  buildParams: (p) => ({
    colorA: vec4From(p.color_a, [0, 0, 0, 1]),
    colorB: vec4From(p.color_b, [1, 1, 1, 1]),
    angle: num(p.angle, 0),
    midpoint: num(p.midpoint, 0.5)
  })
});

const CheckerboardNode = defineSourceNode({
  nodeType: "shader.sources.checkerboard",
  title: "Checkerboard",
  description: "Two-color checkerboard with configurable cell size (GPU).",
  module: sourcesCheckerboardV1,
  extraProps: [
    { name: "color_a", options: colorProp("#ffffff", { label: "Color A" }) },
    { name: "color_b", options: colorProp("#000000", { label: "Color B" }) },
    { name: "cell_size", options: intProp(32, { min: 1, max: 512, label: "Cell size (px)" }) }
  ],
  buildParams: (p) => ({
    colorA: vec4From(p.color_a, [1, 1, 1, 1]),
    colorB: vec4From(p.color_b, [0, 0, 0, 1]),
    cellSize: num(p.cell_size, 32)
  })
});

const RadialGradientNode = defineSourceNode({
  nodeType: "shader.sources.radial_gradient",
  title: "Radial Gradient",
  description: "Inner-to-outer radial gradient around the canvas centre (GPU).",
  module: sourcesRadialGradientV1,
  extraProps: [
    { name: "color_inner", options: colorProp("#ffffff", { label: "Inner color" }) },
    { name: "color_outer", options: colorProp("#000000", { label: "Outer color" }) },
    { name: "radius", options: floatProp(0.5, { min: 0, max: 2, label: "Radius" }) }
  ],
  buildParams: (p) => ({
    colorInner: vec4From(p.color_inner, [1, 1, 1, 1]),
    colorOuter: vec4From(p.color_outer, [0, 0, 0, 1]),
    radius: num(p.radius, 0.5)
  })
});

const AngularGradientNode = defineSourceNode({
  nodeType: "shader.sources.angular_gradient",
  title: "Angular Gradient",
  description: "Sweep gradient around the canvas centre (GPU).",
  module: sourcesAngularGradientV1,
  extraProps: [
    { name: "color_a", options: colorProp("#000000", { label: "Color A" }) },
    { name: "color_b", options: colorProp("#ffffff", { label: "Color B" }) },
    { name: "rotation", options: floatProp(0, { min: -180, max: 180, label: "Rotation (°)" }) }
  ],
  buildParams: (p) => ({
    colorA: vec4From(p.color_a, [0, 0, 0, 1]),
    colorB: vec4From(p.color_b, [1, 1, 1, 1]),
    rotation: num(p.rotation, 0)
  })
});

const DiamondGradientNode = defineSourceNode({
  nodeType: "shader.sources.diamond_gradient",
  title: "Diamond Gradient",
  description: "Inner-to-outer diamond/square gradient (GPU).",
  module: sourcesDiamondGradientV1,
  extraProps: [
    { name: "color_inner", options: colorProp("#ffffff", { label: "Inner color" }) },
    { name: "color_outer", options: colorProp("#000000", { label: "Outer color" }) },
    { name: "radius", options: floatProp(0.5, { min: 0, max: 2, label: "Radius" }) }
  ],
  buildParams: (p) => ({
    colorInner: vec4From(p.color_inner, [1, 1, 1, 1]),
    colorOuter: vec4From(p.color_outer, [0, 0, 0, 1]),
    radius: num(p.radius, 0.5)
  })
});

export const SHADER_SOURCES_NODES: readonly NodeClass[] = [
  SolidNode,
  LinearGradientNode,
  CheckerboardNode,
  RadialGradientNode,
  AngularGradientNode,
  DiamondGradientNode
];
export {
  SolidNode,
  LinearGradientNode,
  CheckerboardNode,
  RadialGradientNode,
  AngularGradientNode,
  DiamondGradientNode
};
