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
import { WGSL_PREMUL_HELPERS } from "../../../../shared/premulWgsl.js";

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
  linearity: "nonlinear-in-rgb",
  kind: "fragment",
  params: InvertParams,
  paramDefaults: { amount: 1 },
  paramUi: {
    amount: { min: 0, max: 1, step: 0.01, label: "Amount" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
${WGSL_PREMUL_HELPERS}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Input is premultiplied. The typed helpers force us through unpremul()
  // before touching channels — the prior hand-rolled "safeA = max(a, 1/255);
  // straight = rgb/safeA; invert; re-premultiply" dance is now expressed as
  // unpremul/premul calls that can't be skipped accidentally.
  let p = samplePremul(layout.$.source, layout.$.samp, uv);
  let s = unpremul(p);
  let inverted = Straight(vec4f(vec3f(1.0) - s.v.rgb, s.v.a));
  let invPremul = premul(inverted);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  // Linear mix between two premul values is itself a premul-safe linear op,
  // so it's correct to lerp src.v ↔ invPremul.v directly.
  return mix(p.v, invPremul.v, coverage * layout.$.params.amount);
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
