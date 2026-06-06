/**
 * `color.hslAdjust@1` — selective hue / saturation / luminance adjustment over
 * an optional hue range.
 *
 * Ported verbatim from the CPU `lib.image.color_grading.HSLAdjust` loop. When
 * `useRange = 0` the adjustment applies to every pixel (the "ALL" path: hue
 * shift, saturation and luminance multipliers). When `useRange = 1` the host
 * passes a normalized `[rangeLo, rangeHi]` hue window (wrapping when
 * `rangeLo > rangeHi`, as for reds) and the per-pixel `blend` weight gates the
 * adjustment by hue proximity to that window's centre, skipping near-grey
 * pixels (`s < 0.1`). Fragment, with the canonical optional mask slot.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const HslAdjustParams = d.struct({
  hueShift: d.f32,
  satAdj: d.f32,
  lumAdj: d.f32,
  rangeLo: d.f32,
  rangeHi: d.f32,
  useRange: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: HslAdjustParams },
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

export const colorHslAdjustV1 = defineModule({
  id: "color.hslAdjust",
  version: 1,
  surface: "internal",
  category: "color",
  linearity: "nonlinear-in-rgb",
  kind: "fragment",
  params: HslAdjustParams,
  paramDefaults: {
    hueShift: 0,
    satAdj: 0,
    lumAdj: 0,
    rangeLo: 0,
    rangeHi: 1,
    useRange: 0
  },
  paramUi: {
    hueShift: { min: -1, max: 1, step: 0.01, label: "Hue shift" },
    satAdj: { min: -1, max: 1, step: 0.01, label: "Saturation" },
    lumAdj: { min: -1, max: 1, step: 0.01, label: "Luminance" },
    rangeLo: { min: 0, max: 1, step: 0.01, label: "Range low" },
    rangeHi: { min: 0, max: 1, step: 0.01, label: "Range high" },
    useRange: { min: 0, max: 1, step: 1, label: "Use range" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
fn rgb2hsv(rgb: vec3f) -> vec3f {
  let maxC = max(max(rgb.r, rgb.g), rgb.b);
  let minC = min(min(rgb.r, rgb.g), rgb.b);
  let delta = maxC - minC;
  var h: f32 = 0.0;
  var s: f32 = 0.0;
  let v: f32 = maxC;
  if (delta > 0.00001) {
    s = delta / maxC;
    if (maxC == rgb.r) {
      h = (rgb.g - rgb.b) / delta;
      if (rgb.g < rgb.b) { h = h + 6.0; }
    } else if (maxC == rgb.g) {
      h = 2.0 + (rgb.b - rgb.r) / delta;
    } else {
      h = 4.0 + (rgb.r - rgb.g) / delta;
    }
    h = h / 6.0;
  }
  return vec3f(h, s, v);
}

fn hsv2rgb(hsv: vec3f) -> vec3f {
  let h = hsv.x * 6.0;
  let s = hsv.y;
  let v = hsv.z;
  let i = floor(h);
  let f = h - i;
  let p = v * (1.0 - s);
  let q = v * (1.0 - s * f);
  let t = v * (1.0 - s * (1.0 - f));
  let idx = i32(i) % 6;
  if (idx == 0) { return vec3f(v, t, p); }
  if (idx == 1) { return vec3f(q, v, p); }
  if (idx == 2) { return vec3f(p, v, t); }
  if (idx == 3) { return vec3f(p, q, v); }
  if (idx == 4) { return vec3f(t, p, v); }
  return vec3f(v, p, q);
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let p = layout.$.params;
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = clamp(src.rgb / safeA, vec3f(0.0), vec3f(1.0));
  var hsv = rgb2hsv(straight);
  var blend: f32 = 1.0;
  if (p.useRange > 0.5) {
    if (hsv.y < 0.1) {
      blend = 0.0;
    } else {
      let lo = p.rangeLo;
      let hi = p.rangeHi;
      if (lo > hi) {
        // Wrapping window (e.g. reds): in-range when above lo OR below hi.
        if (hsv.x >= lo || hsv.x <= hi) {
          let halfWidth = (1.0 - lo + hi) * 0.5;
          let center = fract(lo + halfWidth);
          var dist = abs(hsv.x - center);
          if (dist > 0.5) { dist = 1.0 - dist; }
          blend = clamp(1.0 - dist / halfWidth, 0.0, 1.0);
        } else {
          blend = 0.0;
        }
      } else {
        let center = (lo + hi) * 0.5;
        let halfWidth = (hi - lo) * 0.5;
        let dist = abs(hsv.x - center);
        blend = clamp(1.0 - dist / halfWidth, 0.0, 1.0);
      }
    }
  }
  if (blend > 0.0) {
    hsv.x = fract(hsv.x + p.hueShift * 0.5 * blend);
    hsv.y = clamp(hsv.y * (1.0 + p.satAdj * blend), 0.0, 1.0);
    hsv.z = clamp(hsv.z * (1.0 + p.lumAdj * blend), 0.0, 1.0);
  }
  let processed = hsv2rgb(hsv);
  let mixed = mix(straight, processed, coverage);
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
