/**
 * `mask.apply@1` — multiply mask coverage into source's alpha; RGB unchanged.
 *
 * Coverage comes from `mask.a` (the canonical channel). The `invert` flag
 * inverts the mask first. Fragment; the mask input here is **required** (the
 * op is about applying a mask, after all), unlike the optional `mask` slot
 * on filter/color modules.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const MaskApplyParams = d.struct({
  invert: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: MaskApplyParams },
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

export const maskApplyV1 = defineModule({
  id: "mask.apply",
  version: 1,
  // Promoted in Phase 3 Batch 1: the canonical "apply a mask" op; pairs with
  // every mask-producing module (`mask.fromImage`, `keyer.*`, recipes).
  surface: "published",
  category: "mask",
  kind: "fragment",
  params: MaskApplyParams,
  paramDefaults: { invert: 0 },
  paramUi: {
    invert: { min: 0, max: 1, step: 1, label: "Invert mask" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  var coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  if (layout.$.params.invert > 0.5) {
    coverage = 1.0 - coverage;
  }
  // Source is premultiplied (rgb = a*C). Scaling alpha by coverage requires
  // scaling RGB by the same factor so the output stays valid premultiplied
  // (rgb <= a). Without this, a 50% mask on opaque white produced rgb=1, a=0.5.
  return vec4f(src.rgb * coverage, src.a * coverage);
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
