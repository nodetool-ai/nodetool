import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

// Rows 0..255 are indexed by hue: (hue vs hue, hue vs sat, hue vs luma). Rows 256..511 are
// indexed by lightness or saturation: (luma vs sat, sat vs sat). Every curve is neutral at 0.5.
const Params = d.struct({table: d.arrayOf(d.vec4f, 512)});
const layout = tgpu.bindGroupLayout({source: {texture: "float"}, outputTexture: {storageTexture: "rgba8unorm"}, params: {uniform: Params}});

export const colorHueSatCurvesV1 = defineModule({
  precision: { "source": "working", "output": "working" },
  id: "color.hueSatCurves", version: 1, surface: "internal", category: "color",
  linearity: "nonlinear-in-rgb", kind: "compute", params: Params,
  paramDefaults: {table: Array.from({length: 512}, () => d.vec4f(0.5, 0.5, 0.5, 1))},
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
fn row(offset: u32, at: f32) -> vec4f {
  let position = clamp(at, 0.0, 1.0) * 255.0; let lo = u32(floor(position)); let hi = min(255u, lo + 1u);
  return mix(layout.$.params.table[offset + lo], layout.$.params.table[offset + hi], fract(position));
}
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let at = vec2i(gid.xy); let src = textureLoad(layout.$.source, at, 0);
  let rgb = src.rgb / max(src.a, 1.0 / 255.0); let hsl = toHsl(rgb);
  let byHue = row(0u, hsl.x); let byLuma = row(256u, hsl.z); let bySat = row(256u, hsl.y);
  let corrected = fromHsl(vec3f(fract(hsl.x + byHue.x - 0.5),
    clamp(hsl.y * 2.0 * byHue.y * 2.0 * byLuma.x * 2.0 * bySat.y, 0.0, 1.0),
    clamp(hsl.z + (byHue.z - 0.5) * hsl.y, 0.0, 1.0)));
  textureStore(layout.$.outputTexture, at, vec4f(clamp(corrected, vec3f(0), vec3f(1)) * src.a, src.a));
}`,
  io: {
    inputs: {source: {colorSpace: "encoded-sdr", alpha: "premultiplied", bindingKinds: ["texture_2d"]}},
    output: {colorSpace: "encoded-sdr", alpha: "premultiplied", format: "rgba8unorm", dimensions: "same-as:source"},
    rod: "same-as:source"
  }
});
