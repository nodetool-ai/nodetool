/**
 * `color.cdl@1` — ASC CDL (Color Decision List) primary correction.
 *
 * Ported verbatim from the CPU `lib.image.color_grading.CDL` loop:
 * `out = clamp(in * slope + offset, 0, 1) ^ power`, followed by a luminance-
 * preserving saturation adjustment. The industry-standard exchange formula for
 * trading colour grades between tools. Fragment, with the canonical optional
 * mask slot.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const CdlParams = d.struct({
  slopeR: d.f32,
  slopeG: d.f32,
  slopeB: d.f32,
  offsetR: d.f32,
  offsetG: d.f32,
  offsetB: d.f32,
  powerR: d.f32,
  powerG: d.f32,
  powerB: d.f32,
  saturation: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: CdlParams },
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

export const colorCdlV1 = defineModule({
  id: "color.cdl",
  version: 1,
  surface: "internal",
  category: "color",
  linearity: "nonlinear-in-rgb",
  kind: "fragment",
  params: CdlParams,
  paramDefaults: {
    slopeR: 1,
    slopeG: 1,
    slopeB: 1,
    offsetR: 0,
    offsetG: 0,
    offsetB: 0,
    powerR: 1,
    powerG: 1,
    powerB: 1,
    saturation: 1
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
  let slope = vec3f(p.slopeR, p.slopeG, p.slopeB);
  let offset = vec3f(p.offsetR, p.offsetG, p.offsetB);
  let power = vec3f(p.powerR, p.powerG, p.powerB);
  // Clamp after slope/offset (matches the CPU loop) so pow() sees [0,1] and
  // never takes a negative base.
  var rgb = clamp(straight * slope + offset, vec3f(0.0), vec3f(1.0));
  rgb = pow(rgb, power);
  let lum = luma709(rgb);
  rgb = vec3f(lum) + (rgb - vec3f(lum)) * p.saturation;
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
