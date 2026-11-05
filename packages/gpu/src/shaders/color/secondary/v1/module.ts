import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

const Params = d.struct({
  hueCenter: d.f32, hueWidth: d.f32, hueSoftness: d.f32, rangeSoftness: d.f32,
  saturationMin: d.f32, saturationMax: d.f32, lightnessMin: d.f32, lightnessMax: d.f32,
  hueShift: d.f32, saturation: d.f32, lightness: d.f32, table: d.arrayOf(d.vec4f, 256)
});
const layout = tgpu.bindGroupLayout({source: {texture: "float"}, outputTexture: {storageTexture: "rgba8unorm"}, params: {uniform: Params}});

export const colorSecondaryV1 = defineModule({
  precision: { "source": "working", "output": "working" },
  id: "color.secondary", version: 1, surface: "internal", category: "color",
  linearity: "nonlinear-in-rgb", kind: "compute", params: Params,
  paramDefaults: {
    hueCenter: 0, hueWidth: 180, hueSoftness: 15, rangeSoftness: 0.1,
    saturationMin: 0, saturationMax: 1, lightnessMin: 0, lightnessMax: 1,
    hueShift: 0, saturation: 1, lightness: 0,
    table: Array.from({length: 256}, () => d.vec4f(0.5, 0.5, 0, 1))
  },
  layout, workgroupSize: [16, 16, 1],
  wgsl: /* wgsl */ `
fn toHsl(rgb: vec3f) -> vec3f {
  let hi = max(max(rgb.r, rgb.g), rgb.b); let lo = min(min(rgb.r, rgb.g), rgb.b);
  let delta = hi - lo; let l = (hi + lo) * 0.5;
  if (delta < 0.000001) { return vec3f(0, 0, l); }
  var h = (rgb.r - rgb.g) / delta + 4.0;
  if (hi == rgb.r) { h = (rgb.g - rgb.b) / delta; }
  else if (hi == rgb.g) { h = (rgb.b - rgb.r) / delta + 2.0; }
  return vec3f(fract(h / 6.0), delta / max(0.000001, 1.0 - abs(2.0 * l - 1.0)), l);
}
fn fromHsl(hsl: vec3f) -> vec3f {
  let ramp = clamp(abs(fract(vec3f(hsl.x) + vec3f(0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, vec3f(0), vec3f(1));
  return vec3f(hsl.z) + (1.0 - abs(2.0 * hsl.z - 1.0)) * hsl.y * (ramp - 0.5);
}
fn rangeMask(v: f32, low: f32, high: f32, soft: f32) -> f32 {
  if (low > high) { return 0.0; }
  if (v >= low && v <= high) { return 1.0; }
  if (soft <= 0.0) { return 0.0; }
  if (v < low) { return smoothstep(low - soft, low, v); }
  return 1.0 - smoothstep(high, high + soft, v);
}
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let at = vec2i(gid.xy); let src = textureLoad(layout.$.source, at, 0);
  let rgb = src.rgb / max(src.a, 1.0 / 255.0); let hsl = toHsl(rgb); let p = layout.$.params;
  let distance = abs(fract(hsl.x - p.hueCenter / 360.0 + 0.5) - 0.5) * 360.0;
  var mask = 1.0;
  if (p.hueWidth < 180.0) { mask = rangeMask(distance, 0.0, p.hueWidth, p.hueSoftness) * smoothstep(0.0, 0.01, hsl.y); }
  mask *= rangeMask(hsl.y, p.saturationMin, p.saturationMax, p.rangeSoftness)
    * rangeMask(hsl.z, p.lightnessMin, p.lightnessMax, p.rangeSoftness);
  let position = hsl.x * 255.0; let lo = u32(floor(position)); let hi = min(255u, lo + 1u);
  let curve = mix(p.table[lo].xy, p.table[hi].xy, fract(position));
  let corrected = fromHsl(vec3f(fract(hsl.x + p.hueShift / 360.0 + curve.x - 0.5),
    clamp(hsl.y * p.saturation * 2.0 * curve.y, 0.0, 1.0), clamp(hsl.z + p.lightness, 0.0, 1.0)));
  textureStore(layout.$.outputTexture, at, vec4f(clamp(mix(rgb, corrected, mask), vec3f(0), vec3f(1)) * src.a, src.a));
}`,
  io: {
    inputs: {source: {colorSpace: "encoded-sdr", alpha: "premultiplied", bindingKinds: ["texture_2d"]}},
    output: {colorSpace: "encoded-sdr", alpha: "premultiplied", format: "rgba8unorm", dimensions: "same-as:source"},
    rod: "same-as:source"
  }
});
