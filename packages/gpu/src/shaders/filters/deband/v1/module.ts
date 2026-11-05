import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

const Params = d.struct({strength: d.f32, range: d.u32, threshold: d.f32, dither: d.f32});
const layout = tgpu.bindGroupLayout({source: {texture: "float"}, outputTexture: {storageTexture: "rgba8unorm"}, params: {uniform: Params}});

export const filterDebandV1 = defineModule({
  precision: { "source": "working", "output": "working" },
  id: "filters.deband", version: 1, surface: "internal", category: "filters",
  linearity: "nonlinear-in-rgb", kind: "compute", params: Params,
  paramDefaults: {strength: 0, range: 16, threshold: 0.02, dither: 0.5},
  layout, workgroupSize: [16, 16, 1],
  wgsl: /* wgsl */ `
fn hash01(at: vec2u, seed: u32) -> f32 {
  var h = (at.x * 1597334677u) ^ (at.y * 3812015801u) ^ (seed * 2798796415u);
  h = (h ^ (h >> 16u)) * 2246822519u; h = (h ^ (h >> 13u)) * 3266489917u; h ^= h >> 16u;
  return f32(h >> 8u) / 16777216.0;
}
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let at = vec2i(gid.xy); let src = textureLoad(layout.$.source, at, 0); let p = layout.$.params;
  let rgb = src.rgb / max(src.a, 1.0 / 255.0);
  var sum = rgb * src.a; var weight = src.a;
  let threshold = clamp(p.threshold, 0.0, 0.1);
  for (var ring = 1; ring <= 2; ring++) {
    let radius = 1 + i32(floor(hash01(gid.xy, u32(ring) * 1669u) * f32(clamp(p.range, 1u, 64u))));
    for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) {
      if (dx == 0 && dy == 0) { continue; }
      let sampleAt = clamp(at + vec2i(dx, dy) * radius, vec2i(0), vec2i(dims) - 1);
      let sample = textureLoad(layout.$.source, sampleAt, 0);
      let color = sample.rgb / max(sample.a, 1.0 / 255.0);
      let delta = abs(color - rgb); let difference = max(max(delta.r, delta.g), delta.b);
      if (sample.a > 0.0 && threshold > 0.0) {
        let w = sample.a * (1.0 - smoothstep(threshold * 0.5, threshold, difference));
        sum += color * w; weight += w;
      }
    } }
  }
  let grain = (hash01(gid.xy, 907u) - 0.5) * clamp(p.dither, 0.0, 1.0) / 255.0;
  let result = rgb + clamp(p.strength, 0.0, 1.0) * (sum / max(weight, 1.0 / 255.0) - rgb + grain);
  textureStore(layout.$.outputTexture, at, vec4f(clamp(result, vec3f(0), vec3f(1)) * src.a, src.a));
}`,
  io: {
    inputs: {source: {colorSpace: "encoded-sdr", alpha: "premultiplied", bindingKinds: ["texture_2d"]}},
    output: {colorSpace: "encoded-sdr", alpha: "premultiplied", format: "rgba8unorm", dimensions: "same-as:source"},
    rod: "same-as:source"
  }
});
