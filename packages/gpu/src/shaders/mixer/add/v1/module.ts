/**
 * `mixer.add@1` — additive composite of two textures, `out = source + over * gain`.
 *
 * Premultiplied alpha throughout; alpha follows the same additive rule. Used
 * by the `filters.glow` recipe to fold a blurred bright pass back into the
 * original, and as a general-purpose add layer. Real multi-mode composite
 * (over/multiply/screen/…) is `mixer.composite` (Phase 4 Batch 4 — wraps
 * `WebGPULayerCompositor`).
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const AddParams = d.struct({
  gain: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: AddParams },
  source: { texture: "float" },
  over: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const mixerAddV1 = defineModule({
  id: "mixer.add",
  version: 1,
  surface: "internal",
  category: "mixer",
  linearity: "linear-in-rgb",
  kind: "fragment",
  params: AddParams,
  paramDefaults: { gain: 1 },
  paramUi: {
    gain: { min: 0, max: 4, step: 0.01, label: "Gain" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let s = textureSample(layout.$.source, layout.$.samp, uv);
  let o = textureSample(layout.$.over, layout.$.samp, uv);
  let g = layout.$.params.gain;
  return clamp(s + o * g, vec4f(0.0), vec4f(1.0));
}
`,
  io: {
    inputs: {
      source: {
        colorSpace: "linear",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"]
      },
      over: {
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
    rod: "union-of-inputs"
  }
});
