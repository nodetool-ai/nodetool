/**
 * `filters.threshold@1` — keep pixels whose luma is above `threshold`,
 * black out the rest. `softness` widens the cutoff into a smooth ramp.
 *
 * Used as the bright-extraction stage of the `filters.glow` recipe and as a
 * general-purpose bright-pass filter.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const ThresholdParams = d.struct({
  threshold: d.f32,
  softness: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: ThresholdParams },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const filtersThresholdV1 = defineModule({
  id: "filters.threshold",
  version: 1,
  surface: "internal",
  category: "filters",
  kind: "fragment",
  params: ThresholdParams,
  paramDefaults: { threshold: 0.7, softness: 0.1 },
  paramUi: {
    threshold: { min: 0, max: 1, step: 0.01, label: "Threshold" },
    softness: { min: 0, max: 0.5, step: 0.01, label: "Softness" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let p = layout.$.params;
  let luma = dot(src.rgb, vec3f(0.299, 0.587, 0.114));
  let soft = max(p.softness, 0.0001);
  let t = smoothstep(p.threshold - soft, p.threshold + soft, luma);
  return vec4f(src.rgb * t, src.a * t);
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
