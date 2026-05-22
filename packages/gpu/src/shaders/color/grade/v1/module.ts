/**
 * `color.grade@1` — per-pixel color grading (brightness, contrast,
 * saturation, hue, temperature, tint, shadows/highlights).
 *
 * Migrated verbatim from the timeline preview's `effectsComputeShader`
 * (`web/src/components/timeline/preview/gpu/shaders.ts`). The hand-packed
 * 8×f32 uniform `Float32Array` is replaced by the TypeGPU `ColorGradeParams`
 * schema; the effect math is unchanged. Stays `surface: "internal"` until the
 * parameter schema is reviewed for promotion (Phase 3).
 *
 * `compute` kind is a migration accident — the timeline shader was authored as
 * a compute pass. New image-in/image-out modules default to `fragment`.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const ColorGradeParams = d.struct({
  brightness: d.f32,
  contrast: d.f32,
  saturation: d.f32,
  hue: d.f32,
  temperature: d.f32,
  tint: d.f32,
  shadows: d.f32,
  highlights: d.f32
});

const layout = tgpu.bindGroupLayout({
  inputTexture: { texture: "float" },
  outputTexture: { storageTexture: "rgba8unorm" },
  params: { uniform: ColorGradeParams }
});

export const colorGradeV1 = defineModule({
  id: "color.grade",
  version: 1,
  surface: "internal",
  category: "color",
  kind: "compute",
  params: ColorGradeParams,
  paramDefaults: {
    brightness: 0,
    contrast: 1,
    saturation: 1,
    hue: 0,
    temperature: 0,
    tint: 0,
    shadows: 0,
    highlights: 0
  },
  paramUi: {
    brightness: { min: -1, max: 1, step: 0.01, label: "Brightness" },
    contrast: { min: 0, max: 4, step: 0.01, label: "Contrast" },
    saturation: { min: 0, max: 4, step: 0.01, label: "Saturation" },
    hue: { min: -180, max: 180, step: 1, label: "Hue", notes: "degrees" },
    temperature: { min: -1, max: 1, step: 0.01, label: "Temperature" },
    tint: { min: -1, max: 1, step: 0.01, label: "Tint" },
    shadows: { min: -1, max: 1, step: 0.01, label: "Shadows" },
    highlights: { min: -1, max: 1, step: 0.01, label: "Highlights" }
  },
  layout,
  workgroupSize: [16, 16, 1],
  wgsl: /* wgsl */ `
fn rgb2hsv(rgb: vec3<f32>) -> vec3<f32> {
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
  return vec3<f32>(h, s, v);
}

fn hsv2rgb(hsv: vec3<f32>) -> vec3<f32> {
  let h = hsv.x * 6.0;
  let s = hsv.y;
  let v = hsv.z;
  let i = floor(h);
  let f = h - i;
  let p = v * (1.0 - s);
  let q = v * (1.0 - s * f);
  let t = v * (1.0 - s * (1.0 - f));
  let idx = i32(i) % 6;
  if (idx == 0) { return vec3<f32>(v, t, p); }
  if (idx == 1) { return vec3<f32>(q, v, p); }
  if (idx == 2) { return vec3<f32>(p, v, t); }
  if (idx == 3) { return vec3<f32>(p, q, v); }
  if (idx == 4) { return vec3<f32>(t, p, v); }
  return vec3<f32>(v, p, q);
}

fn smoothstepCustom(e0: f32, e1: f32, x: f32) -> f32 {
  let t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.inputTexture);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));
  let effects = layout.$.params;
  var color = textureLoad(layout.$.inputTexture, coords, 0);
  var rgb = color.rgb;

  if (abs(effects.brightness) > 0.001) {
    rgb = clamp(rgb + vec3<f32>(effects.brightness), vec3<f32>(0.0), vec3<f32>(1.0));
  }
  if (abs(effects.contrast - 1.0) > 0.001) {
    rgb = clamp((rgb - 0.5) * effects.contrast + 0.5, vec3<f32>(0.0), vec3<f32>(1.0));
  }
  if (abs(effects.saturation - 1.0) > 0.001) {
    let lum = dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
    rgb = clamp(mix(vec3<f32>(lum), rgb, effects.saturation), vec3<f32>(0.0), vec3<f32>(1.0));
  }
  if (abs(effects.hue) > 0.001) {
    var hsv = rgb2hsv(rgb);
    hsv.x = fract(hsv.x + effects.hue / 360.0);
    rgb = hsv2rgb(hsv);
  }
  if (abs(effects.temperature) > 0.001) {
    if (effects.temperature > 0.0) {
      rgb.r = min(1.0, rgb.r + effects.temperature * 0.2);
      rgb.g = min(1.0, rgb.g + effects.temperature * 0.1);
      rgb.b = max(0.0, rgb.b - effects.temperature * 0.2);
    } else {
      rgb.r = max(0.0, rgb.r + effects.temperature * 0.2);
      rgb.g = max(0.0, rgb.g + effects.temperature * 0.05);
      rgb.b = min(1.0, rgb.b - effects.temperature * 0.2);
    }
  }
  if (abs(effects.tint) > 0.001) {
    rgb.r = clamp(rgb.r + effects.tint * 0.1, 0.0, 1.0);
    rgb.g = clamp(rgb.g - effects.tint * 0.2, 0.0, 1.0);
    rgb.b = clamp(rgb.b + effects.tint * 0.1, 0.0, 1.0);
  }
  if (abs(effects.shadows) > 0.001 || abs(effects.highlights) > 0.001) {
    let lum = dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
    let shadowW = 1.0 - smoothstepCustom(0.0, 0.33, lum);
    let highlightW = smoothstepCustom(0.66, 1.0, lum);
    let adj = effects.shadows * shadowW * 0.3 + effects.highlights * highlightW * 0.3;
    rgb = clamp(rgb + vec3<f32>(adj), vec3<f32>(0.0), vec3<f32>(1.0));
  }

  textureStore(layout.$.outputTexture, coords, vec4<f32>(rgb, color.a));
}
`,
  io: {
    inputs: {
      source: {
        colorSpace: "srgb",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"]
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
