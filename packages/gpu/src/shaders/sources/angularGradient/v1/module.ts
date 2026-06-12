/**
 * `sources.angularGradient@1` — two-color angular gradient around center.
 *
 * `rotation` offsets the seam angle in radians. Zero-input source,
 * host-specified dimensions.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const AngularGradientParams = d.struct({
  colorA: d.vec4f,
  colorB: d.vec4f,
  rotation: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: AngularGradientParams }
});

export const sourcesAngularGradientV1 = defineModule({
  id: "sources.angularGradient",
  version: 1,
  surface: "internal",
  category: "sources",
  linearity: "source",
  kind: "fragment",
  params: AngularGradientParams,
  paramDefaults: {
    colorA: d.vec4f(0, 0, 0, 1),
    colorB: d.vec4f(1, 1, 1, 1),
    rotation: 0
  },
  paramUi: {
    colorA: { label: "Color A" },
    colorB: { label: "Color B" },
    rotation: {
      min: -Math.PI,
      max: Math.PI,
      step: 0.01,
      label: "Rotation",
      notes: "radians"
    }
  },
  layout,
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let delta = uv - vec2f(0.5, 0.5);
  let theta = atan2(delta.y, delta.x) - p.rotation;
  let t = fract(theta / (2.0 * 3.14159265359) + 1.0);
  // The colour params arrive premultiplied (hosts premultiply at the colour
  // picker boundary); a mix of premultiplied endpoints stays premultiplied.
  // Re-multiplying by alpha here would darken translucent colours to rgb*a².
  return mix(p.colorA, p.colorB, t);
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
