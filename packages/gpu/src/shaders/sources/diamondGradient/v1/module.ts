/**
 * `sources.diamondGradient@1` — two-color diamond gradient.
 *
 * Uses Manhattan distance from center for a diamond-shaped ramp. Zero-input
 * source, host-specified dimensions.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const DiamondGradientParams = d.struct({
  colorInner: d.vec4f,
  colorOuter: d.vec4f,
  radius: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: DiamondGradientParams }
});

export const sourcesDiamondGradientV1 = defineModule({
  id: "sources.diamondGradient",
  version: 1,
  surface: "internal",
  category: "sources",
  linearity: "source",
  kind: "fragment",
  params: DiamondGradientParams,
  paramDefaults: {
    colorInner: d.vec4f(0, 0, 0, 1),
    colorOuter: d.vec4f(1, 1, 1, 1),
    radius: 0.5
  },
  paramUi: {
    colorInner: { label: "Inner color" },
    colorOuter: { label: "Outer color" },
    radius: { min: 0.01, max: 1.5, step: 0.01, label: "Radius" }
  },
  layout,
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let d = abs(uv - vec2f(0.5, 0.5));
  let r = max(p.radius, 0.0001);
  let t = clamp((d.x + d.y) / r, 0.0, 1.0);
  // Straight colour params → premultiplied output: interpolate in premultiplied
  // space so a translucent inner/outer colour keeps rgb <= a.
  let ci = vec4f(p.colorInner.rgb * p.colorInner.a, p.colorInner.a);
  let co = vec4f(p.colorOuter.rgb * p.colorOuter.a, p.colorOuter.a);
  return mix(ci, co, t);
}
`,
  io: {
    inputs: {},
    output: {
      colorSpace: "linear",
      alpha: "premultiplied",
      format: "rgba8unorm",
      dimensions: "host-specified"
    },
    rod: "explicit"
  }
});
