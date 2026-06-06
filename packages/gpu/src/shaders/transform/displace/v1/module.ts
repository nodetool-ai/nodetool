/**
 * `transform.displace@1` — per-pixel UV offset driven by a displacement map.
 *
 * Each output pixel reads `(dx, dy)` from the displacement texture's R+G
 * channels (centered: `0.5` is no offset, `0` and `1` are the extremes), scales
 * by `(amountX, amountY)`, and samples the source at `uv + offset`. Used for
 * heat-haze, water ripples, glass, and as the "warp by noise" building block
 * when paired with `sources.noise` (Phase 3 Batch 1+).
 *
 * Output dimensions stay `same-as:source`. Out-of-range samples (after the
 * offset pushes UV outside `[0, 1]`) return transparent black so a strong
 * displacement leaves clean transparency instead of smearing edge color.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const DisplaceParams = d.struct({
  amountX: d.f32,
  amountY: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: DisplaceParams },
  source: { texture: "float" },
  displacement: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const transformDisplaceV1 = defineModule({
  id: "transform.displace",
  version: 1,
  surface: "internal",
  category: "transform",
  linearity: "linear-in-rgb",
  kind: "fragment",
  params: DisplaceParams,
  paramDefaults: { amountX: 0.05, amountY: 0.05 },
  paramUi: {
    amountX: { min: -1, max: 1, step: 0.005, label: "Amount X", notes: "× UV" },
    amountY: { min: -1, max: 1, step: 0.005, label: "Amount Y", notes: "× UV" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let disp = textureSample(layout.$.displacement, layout.$.samp, uv);
  let offset = vec2f((disp.r - 0.5) * 2.0 * p.amountX, (disp.g - 0.5) * 2.0 * p.amountY);
  let s = uv + offset;
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0) {
    return vec4f(0.0);
  }
  return textureSample(layout.$.source, layout.$.samp, s);
}
`,
  io: {
    inputs: {
      source: {
        colorSpace: "linear",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"]
      },
      displacement: {
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
