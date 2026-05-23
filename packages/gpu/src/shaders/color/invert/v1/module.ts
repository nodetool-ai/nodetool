/**
 * `color.invert@1` — invert RGB (1 - rgb), preserve alpha.
 *
 * Fragment, mask slot honored (`output = mix(source, processed, coverage * amount)`).
 * The `amount` param lets the inversion fade smoothly between 0 (passthrough) and
 * 1 (full invert) — useful for animated transitions.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const InvertParams = d.struct({
  amount: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: InvertParams },
  source: { texture: "float" },
  mask: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const colorInvertV1 = defineModule({
  id: "color.invert",
  version: 1,
  // Promoted in Phase 3 Batch 1: trivial schema (single `amount` param) and
  // canonical mask slot; no near-term split or rename in sight.
  surface: "published",
  category: "color",
  kind: "fragment",
  params: InvertParams,
  paramDefaults: { amount: 1 },
  paramUi: {
    amount: { min: 0, max: 1, step: 0.01, label: "Amount" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let inverted = vec3f(1.0) - src.rgb;
  let mixed = mix(src.rgb, inverted, coverage * layout.$.params.amount);
  return vec4f(mixed, src.a);
}
`,
  io: {
    inputs: {
      source: {
        colorSpace: "linear",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"]
      },
      mask: {
        colorSpace: "linear",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"],
        optional: true
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
