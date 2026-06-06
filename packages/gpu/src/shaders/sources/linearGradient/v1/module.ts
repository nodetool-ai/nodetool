/**
 * `sources.linearGradient@1` — two-color linear gradient at an angle.
 *
 * `angle` in radians (0 = horizontal, left→right); `midpoint` shifts the 50%
 * mark along the gradient axis (0..1). Zero-input source, host-specified
 * dimensions.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const LinearGradientParams = d.struct({
  colorA: d.vec4f,
  colorB: d.vec4f,
  angle: d.f32,
  midpoint: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: LinearGradientParams }
});

export const sourcesLinearGradientV1 = defineModule({
  id: "sources.linearGradient",
  version: 1,
  surface: "internal",
  category: "sources",
  linearity: "source",
  kind: "fragment",
  params: LinearGradientParams,
  paramDefaults: {
    colorA: d.vec4f(0, 0, 0, 1),
    colorB: d.vec4f(1, 1, 1, 1),
    angle: 0,
    midpoint: 0.5
  },
  paramUi: {
    colorA: { label: "Color A" },
    colorB: { label: "Color B" },
    angle: { min: -Math.PI, max: Math.PI, step: 0.01, label: "Angle", notes: "radians" },
    midpoint: { min: 0.01, max: 0.99, step: 0.01, label: "Midpoint" }
  },
  layout,
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let c = vec2f(cos(p.angle), sin(p.angle));
  let t01 = clamp(dot(uv - vec2f(0.5), c) + 0.5, 0.0, 1.0);
  let mid = clamp(p.midpoint, 0.01, 0.99);
  var t: f32 = 0.0;
  if (t01 < mid) {
    t = (t01 / mid) * 0.5;
  } else {
    t = 0.5 + ((t01 - mid) / (1.0 - mid)) * 0.5;
  }
  // The colour params are straight RGBA; the output contract is premultiplied.
  // Interpolate in premultiplied space so the result satisfies rgb <= a for any
  // translucent colour (returning the straight mix directly violated it).
  let ca = vec4f(p.colorA.rgb * p.colorA.a, p.colorA.a);
  let cb = vec4f(p.colorB.rgb * p.colorB.a, p.colorB.a);
  return mix(ca, cb, t);
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
