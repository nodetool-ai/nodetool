import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const CubeLutParams = d.struct({
  size: d.f32,
  intensity: d.f32,
  domainMin: d.vec4f,
  domainMax: d.vec4f
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: CubeLutParams },
  source: { texture: "float" },
  lut: { texture: "float" },
  mask: { texture: "float" },
  samp: { sampler: "filtering" }
});

export const colorCubeLutV1 = defineModule({
  id: "color.cubeLut",
  version: 1,
  surface: "internal",
  category: "color",
  linearity: "nonlinear-in-rgb",
  kind: "fragment",
  params: CubeLutParams,
  paramDefaults: {
    size: 2,
    intensity: 1,
    domainMin: d.vec4f(0, 0, 0, 0),
    domainMax: d.vec4f(1, 1, 1, 0)
  },
  layout,
  samplers: { samp: { magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" } },
  wgsl: /* wgsl */ `
fn lookup(r: i32, g: i32, b: i32, size: i32) -> vec3f {
  return textureLoad(layout.$.lut, vec2i(b * size + r, g), 0).rgb;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let size = i32(round(p.size));
  let straight = src.rgb / max(src.a, 1.0 / 255.0);
  let domain = max(p.domainMax.xyz - p.domainMin.xyz, vec3f(0.000001));
  let coordinate = clamp((straight - p.domainMin.xyz) / domain, vec3f(0.0), vec3f(1.0)) * f32(size - 1);
  let lo = vec3i(floor(coordinate));
  let hi = min(lo + vec3i(1), vec3i(size - 1));
  let f = fract(coordinate);
  var graded = vec3f(0.0);
  for (var bz = 0; bz <= 1; bz = bz + 1) {
    for (var gy = 0; gy <= 1; gy = gy + 1) {
      for (var rx = 0; rx <= 1; rx = rx + 1) {
        let r = select(lo.x, hi.x, rx == 1);
        let g = select(lo.y, hi.y, gy == 1);
        let b = select(lo.z, hi.z, bz == 1);
        let weight = select(1.0 - f.x, f.x, rx == 1)
          * select(1.0 - f.y, f.y, gy == 1)
          * select(1.0 - f.z, f.z, bz == 1);
        graded = graded + lookup(r, g, b, size) * weight;
      }
    }
  }
  let mixAmount = clamp(p.intensity * coverage, 0.0, 1.0);
  return vec4f(clamp(mix(straight, graded, mixAmount), vec3f(0.0), vec3f(1.0)) * src.a, src.a);
}
`,
  io: {
    inputs: {
      source: { colorSpace: "srgb", alpha: "premultiplied", bindingKinds: ["texture_2d"] },
      lut: { colorSpace: "srgb", alpha: "premultiplied", bindingKinds: ["texture_2d"] },
      mask: { colorSpace: "srgb", alpha: "premultiplied", bindingKinds: ["texture_2d"], optional: true }
    },
    output: { colorSpace: "srgb", alpha: "premultiplied", format: "rgba8unorm", dimensions: "same-as:source" },
    rod: "same-as:source"
  }
});
