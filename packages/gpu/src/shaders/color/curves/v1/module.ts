/**
 * `color.curves@1` — black/white-point levels plus shadow / midtone /
 * highlight tonal bends, with per-channel midtone gamma.
 *
 * Ported verbatim from the CPU `lib.image.color_grading.Curves` loop:
 * remap `[blackPoint, whitePoint]` to `[0, 1]`, apply a parametric shadow lift,
 * a global midtone gamma, a highlight roll, then a per-channel midtone gamma.
 * Fragment, with the canonical optional mask slot.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const CurvesParams = d.struct({
  blackPoint: d.f32,
  whitePoint: d.f32,
  shadows: d.f32,
  midtones: d.f32,
  highlights: d.f32,
  redMidtones: d.f32,
  greenMidtones: d.f32,
  blueMidtones: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: CurvesParams },
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

export const colorCurvesV1 = defineModule({
  id: "color.curves",
  version: 1,
  surface: "internal",
  category: "color",
  linearity: "nonlinear-in-rgb",
  kind: "fragment",
  params: CurvesParams,
  paramDefaults: {
    blackPoint: 0,
    whitePoint: 1,
    shadows: 0,
    midtones: 0,
    highlights: 0,
    redMidtones: 0,
    greenMidtones: 0,
    blueMidtones: 0
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let p = layout.$.params;
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let range = max(0.001, p.whitePoint - p.blackPoint);
  let gammaAll = 1.0 / max(0.01, 1.0 + p.midtones);
  let gammaPer = vec3f(
    1.0 / max(0.01, 1.0 + p.redMidtones),
    1.0 / max(0.01, 1.0 + p.greenMidtones),
    1.0 / max(0.01, 1.0 + p.blueMidtones)
  );
  var rgb = clamp((straight - vec3f(p.blackPoint)) / range, vec3f(0.0), vec3f(1.0));
  rgb = rgb + p.shadows * (vec3f(1.0) - rgb) * rgb;
  rgb = pow(max(rgb, vec3f(0.0)), vec3f(gammaAll));
  rgb = rgb + p.highlights * rgb * (vec3f(1.0) - rgb);
  rgb = pow(max(rgb, vec3f(0.0)), gammaPer);
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
