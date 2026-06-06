/**
 * `color.exposureTone@1` — Lightroom/Camera-Raw style tonal exposure.
 *
 * Ported verbatim from the CPU `lib.image.color_grading.Exposure` loop:
 * multiplicative exposure in stops, luminance-weighted highlight/shadow
 * recovery, white/black point push, and a final contrast pivot around
 * mid-grey. With every tonal knob at its default (`0`) this collapses to the
 * pure `rgb * 2^exposure` of the simpler `color.exposure` module. Fragment,
 * with the canonical optional mask slot.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const ExposureToneParams = d.struct({
  exposure: d.f32,
  contrast: d.f32,
  highlights: d.f32,
  shadows: d.f32,
  whites: d.f32,
  blacks: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: ExposureToneParams },
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

export const colorExposureToneV1 = defineModule({
  id: "color.exposureTone",
  version: 1,
  surface: "internal",
  category: "color",
  linearity: "nonlinear-in-rgb",
  kind: "fragment",
  params: ExposureToneParams,
  paramDefaults: {
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0
  },
  paramUi: {
    exposure: { min: -5, max: 5, step: 0.1, label: "Exposure", notes: "stops (2^x)" },
    contrast: { min: -1, max: 1, step: 0.01, label: "Contrast" },
    highlights: { min: -1, max: 1, step: 0.01, label: "Highlights" },
    shadows: { min: -1, max: 1, step: 0.01, label: "Shadows" },
    whites: { min: -1, max: 1, step: 0.01, label: "Whites" },
    blacks: { min: -1, max: 1, step: 0.01, label: "Blacks" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
fn luma709(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let p = layout.$.params;
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let expMul = pow(2.0, p.exposure);
  var rgb = straight * expMul;
  let lum = luma709(rgb);
  let hlMask = clamp((lum - 0.5) * 2.0, 0.0, 1.0);
  let shMask = clamp((0.5 - lum) * 2.0, 0.0, 1.0);
  rgb = rgb - vec3f(hlMask * p.highlights * 0.5) + vec3f(shMask * p.shadows * 0.5);
  rgb = rgb + p.whites * 0.2 * rgb;
  rgb = rgb + p.blacks * 0.2 * (vec3f(1.0) - rgb);
  rgb = vec3f(0.5) + (rgb - vec3f(0.5)) * (1.0 + p.contrast);
  let mixed = mix(straight, rgb, coverage);
  return vec4f(clamp(mixed, vec3f(0.0), vec3f(1.0)) * src.a, src.a);
}
`,
  io: {
    inputs: {
      source: {
        colorSpace: "srgb",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"]
      },
      mask: {
        colorSpace: "srgb",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"],
        optional: true
      }
    },
    output: {
      colorSpace: "srgb",
      alpha: "premultiplied",
      format: "rgba8unorm",
      dimensions: "same-as:source"
    },
    rod: "same-as:source"
  }
});
