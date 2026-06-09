/**
 * `color.colorBalance@1` — white-balance temperature / tint shift.
 *
 * Ported verbatim from the CPU `lib.image.color_grading.ColorBalance` loop:
 * temperature pushes red up and blue down (warmer), tint trades green against
 * magenta. Both knobs are scaled by `0.3` then applied additively to straight
 * RGB. Fragment, with the canonical optional mask slot.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const ColorBalanceParams = d.struct({
  temperature: d.f32,
  tint: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: ColorBalanceParams },
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

export const colorColorBalanceV1 = defineModule({
  id: "color.colorBalance",
  version: 1,
  surface: "internal",
  category: "color",
  linearity: "nonlinear-in-rgb",
  kind: "fragment",
  params: ColorBalanceParams,
  paramDefaults: { temperature: 0, tint: 0 },
  paramUi: {
    temperature: { min: -1, max: 1, step: 0.01, label: "Temperature" },
    tint: { min: -1, max: 1, step: 0.01, label: "Tint" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let p = layout.$.params;
  // Operate on straight color so the additive shifts act on the underlying
  // colour, not the premultiplied magnitude. Re-premultiply on store.
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let tempShift = p.temperature * 0.3;
  let tintShift = p.tint * 0.3;
  var rgb = straight;
  rgb.r = rgb.r + tempShift + tintShift * 0.5;
  rgb.g = rgb.g - tintShift;
  rgb.b = rgb.b - tempShift + tintShift * 0.5;
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
