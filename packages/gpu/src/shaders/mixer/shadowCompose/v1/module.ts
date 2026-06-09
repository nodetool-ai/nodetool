/**
 * `mixer.shadowCompose@1` — composite `source` over a coloured, offset
 * shadow read from a precomputed mask.
 *
 * Internal helper for the `mixer.dropShadow@1` recipe. Samples `shadowMask`
 * at `uv - offset`, multiplies its alpha by the shadow `color` and
 * `intensity` to produce a shadow contribution, then alpha-composites
 * `source` over the shadow.
 *
 * Stays `surface: "internal"` — published consumers should use the recipe,
 * not this primitive directly.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const ShadowComposeParams = d.struct({
  color: d.vec4f,
  offsetX: d.f32,
  offsetY: d.f32,
  intensity: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: ShadowComposeParams },
  source: { texture: "float" },
  shadowMask: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const mixerShadowComposeV1 = defineModule({
  id: "mixer.shadowCompose",
  version: 1,
  surface: "internal",
  category: "mixer",
  linearity: "linear-in-rgb",
  kind: "fragment",
  params: ShadowComposeParams,
  paramDefaults: {
    color: d.vec4f(0, 0, 0, 1),
    offsetX: 0.02,
    offsetY: 0.02,
    intensity: 0.6
  },
  paramUi: {
    color: { label: "Shadow color", notes: "RGBA, straight alpha" },
    offsetX: { min: -0.5, max: 0.5, step: 0.005, label: "Offset X" },
    offsetY: { min: -0.5, max: 0.5, step: 0.005, label: "Offset Y" },
    intensity: { min: 0, max: 4, step: 0.01, label: "Intensity" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let shadowUv = uv - vec2f(p.offsetX, p.offsetY);
  // Sample the mask unconditionally (textureSample must run in uniform control
  // flow) and zero its contribution outside the offset mask's bounds.
  let inBounds = shadowUv.x >= 0.0 && shadowUv.x <= 1.0 && shadowUv.y >= 0.0 && shadowUv.y <= 1.0;
  let shadowSample = textureSample(layout.$.shadowMask, layout.$.samp, shadowUv);
  let shadowA = select(0.0, shadowSample.a, inBounds);
  let cov = clamp(shadowA * p.color.a * p.intensity, 0.0, 1.0);
  let shadow = vec4f(p.color.rgb * cov, cov);
  // source over shadow: out = src + shadow * (1 - src.a). Both premultiplied.
  return src + shadow * (1.0 - src.a);
}
`,
  io: {
    inputs: {
      source: {
        colorSpace: "linear",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"]
      },
      shadowMask: {
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
