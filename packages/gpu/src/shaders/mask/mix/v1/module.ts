/**
 * `mask.mix@1` — mix `base` toward `source` by mask coverage:
 * `out = base * (1 - c) + source * c` on every premultiplied channel.
 *
 * The timeline uses it for per-effect masks: `source` is the effect result,
 * `base` the effect input, and `mask.a` the combined mask coverage.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const MaskMixParams = d.struct({
  amount: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: MaskMixParams },
  source: { texture: "float" },
  base: { texture: "float" },
  mask: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "nearest",
  minFilter: "nearest",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const maskMixV1 = defineModule({
  precision: { "source": "working", "base": "working", "mask": "fixed", "output": "working" },
  id: "mask.mix",
  version: 1,
  surface: "internal",
  category: "mask",
  linearity: "linear-in-rgb",
  kind: "fragment",
  params: MaskMixParams,
  paramDefaults: { amount: 1 },
  paramUi: {
    amount: { min: 0, max: 1, step: 0.01, label: "Amount" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let treated = textureSample(layout.$.source, layout.$.samp, uv);
  let original = textureSample(layout.$.base, layout.$.samp, uv);
  let coverage = clamp(textureSample(layout.$.mask, layout.$.samp, uv).a * layout.$.params.amount, 0.0, 1.0);
  return mix(original, treated, coverage);
}
`,
  io: {
    inputs: {
      source: { colorSpace: "encoded-sdr", alpha: "premultiplied", bindingKinds: ["texture_2d"] },
      base: { colorSpace: "encoded-sdr", alpha: "premultiplied", bindingKinds: ["texture_2d"] },
      mask: { colorSpace: "data", alpha: "premultiplied", bindingKinds: ["texture_2d"] }
    },
    output: {
      colorSpace: "encoded-sdr",
      alpha: "premultiplied",
      format: "rgba8unorm",
      dimensions: "same-as:source"
    },
    rod: "same-as:source"
  }
});
