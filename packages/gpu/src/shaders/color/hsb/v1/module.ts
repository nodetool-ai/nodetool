/**
 * `color.hsb@1` — hue / saturation / brightness shift.
 *
 * Hue is in degrees (-180..180); saturation is multiplicative (0=grayscale,
 * 1=passthrough, >1=oversaturate); brightness is multiplicative on the value
 * channel. Math is the standard `rgb ↔ hsv` round-trip used by `color.grade`.
 * Fragment, with the canonical mask slot.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const HsbParams = d.struct({
  hue: d.f32,
  saturation: d.f32,
  brightness: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: HsbParams },
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

export const colorHsbV1 = defineModule({
  id: "color.hsb",
  version: 1,
  // Promoted in Phase 3 Batch 1: HSB shift is the workflow user's mental
  // model for color adjustment; schema matches that vocabulary exactly.
  surface: "published",
  category: "color",
  kind: "fragment",
  params: HsbParams,
  paramDefaults: { hue: 0, saturation: 1, brightness: 1 },
  paramUi: {
    hue: { min: -180, max: 180, step: 1, label: "Hue", notes: "degrees" },
    saturation: { min: 0, max: 4, step: 0.01, label: "Saturation" },
    brightness: { min: 0, max: 4, step: 0.01, label: "Brightness" }
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
  var hsv = rgb2hsv(clamp(src.rgb, vec3f(0.0), vec3f(1.0)));
  hsv.x = fract(hsv.x + p.hue / 360.0);
  hsv.y = clamp(hsv.y * p.saturation, 0.0, 1.0);
  hsv.z = clamp(hsv.z * p.brightness, 0.0, 1.0);
  let processed = clamp(hsv2rgb(hsv), vec3f(0.0), vec3f(1.0));
  let mixed = mix(src.rgb, processed, coverage);
  return vec4f(mixed, src.a);
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
