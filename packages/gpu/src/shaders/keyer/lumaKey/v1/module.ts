/**
 * `keyer.lumaKey@1` — clear pixels whose luma falls outside `[low, high]`.
 *
 * Coverage ramps smoothly across `softness` on each side of the band so the
 * matte feathers rather than aliasing. Output alpha is multiplied by the
 * resulting coverage (the source alpha is preserved when fully inside the
 * band, dropped to zero outside). Fragment.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const LumaKeyParams = d.struct({
  low: d.f32,
  high: d.f32,
  softness: d.f32,
  invert: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: LumaKeyParams },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const keyerLumaKeyV1 = defineModule({
  id: "keyer.lumaKey",
  version: 1,
  // Promoted in Phase 3 Batch 1: luminance keyer with `(low, high, softness)`
  // schema is the workhorse op for matte-from-brightness workflows.
  surface: "published",
  category: "keyer",
  kind: "fragment",
  params: LumaKeyParams,
  paramDefaults: { low: 0, high: 1, softness: 0.05, invert: 0 },
  paramUi: {
    low: { min: 0, max: 1, step: 0.01, label: "Low" },
    high: { min: 0, max: 1, step: 0.01, label: "High" },
    softness: { min: 0, max: 0.5, step: 0.01, label: "Softness" },
    invert: { min: 0, max: 1, step: 1, label: "Invert", notes: "0 keep band / 1 cut band" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let p = layout.$.params;
  // Input is premultiplied; compute luma on the underlying straight color so
  // the band thresholds don't drift with a. Rec. 709 weights match the
  // declared linear color space (Rec. 601 is the gamma-space coefficient set).
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let luma = dot(straight, vec3f(0.2126, 0.7152, 0.0722));
  let soft = max(p.softness, 0.0001);
  let lowEdge = smoothstep(p.low - soft, p.low + soft, luma);
  let highEdge = 1.0 - smoothstep(p.high - soft, p.high + soft, luma);
  var coverage = lowEdge * highEdge;
  if (p.invert > 0.5) {
    coverage = 1.0 - coverage;
  }
  // Multiply RGB by coverage too so the result stays valid premultiplied.
  return vec4f(src.rgb * coverage, src.a * coverage);
}
`,
  io: {
    inputs: {
      source: {
        colorSpace: "linear",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"]
      }
    },
    output: {
      colorSpace: "linear",
      alpha: "premultiplied",
      format: "rgba8unorm",
      dimensions: "same-as:source"
    },
    rod: "same-as:source"
  }
});
