/**
 * `sources.radialGradient@1` — two-color radial gradient.
 *
 * `radius` controls where the outer color is fully reached (in normalized UV
 * units from center). Zero-input source, host-specified dimensions.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const RadialGradientParams = d.struct({
  colorInner: d.vec4f,
  colorOuter: d.vec4f,
  radius: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: RadialGradientParams }
});

export const sourcesRadialGradientV1 = defineModule({
  id: "sources.radialGradient",
  version: 1,
  surface: "internal",
  category: "sources",
  linearity: "source",
  kind: "fragment",
  params: RadialGradientParams,
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
  let r = max(p.radius, 0.0001);
  let t = clamp(distance(uv, vec2f(0.5, 0.5)) / r, 0.0, 1.0);
  return mix(p.colorInner, p.colorOuter, t);
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
