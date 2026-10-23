/** Film grain with jittered Gaussian convolution and Soft Light exposure. */
import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const GrainParams = d.struct({
  amount: d.f32,
  size: d.f32,
  colorAmount: d.f32,
  seed: d.f32,
  roughness: d.f32,
  softness: d.f32
});

const layout = tgpu.bindGroupLayout({
  source: { texture: "float" },
  outputTexture: { storageTexture: "rgba8unorm" },
  params: { uniform: GrainParams }
});

export const filtersGrainV2 = defineModule({
  id: "filters.grain",
  version: 2,
  surface: "internal",
  category: "filters",
  linearity: "nonlinear-in-rgb",
  kind: "compute",
  params: GrainParams,
  paramDefaults: { amount: 0, size: 1, colorAmount: 0, seed: 0, roughness: 0.5, softness: 0.25 },
  paramUi: {
    amount: { min: 0, max: 1, step: 0.01, label: "Amount" },
    size: { min: 1, max: 16, step: 0.5, label: "Size" },
    colorAmount: { min: 0, max: 1, step: 0.01, label: "Colour" },
    seed: { label: "Seed" },
    roughness: { min: 0, max: 1, step: 0.01, label: "Roughness" },
    softness: { min: 0, max: 1, step: 0.01, label: "Softness" }
  },
  layout,
  workgroupSize: [16, 16, 1],
  wgsl: /* wgsl */ `
// Integer hashing avoids device-dependent float rounding in the noise source.
fn hash31(cell: vec2i, seed: u32) -> f32 {
  var h = (u32(cell.x) * 1597334677u) ^ (u32(cell.y) * 3812015801u) ^ (seed * 2798796415u);
  h = (h ^ (h >> 16u)) * 2246822519u;
  h = (h ^ (h >> 13u)) * 3266489917u;
  h = h ^ (h >> 16u);
  return f32(h >> 8u) / 16777216.0;
}

// Three independent uniforms approximate a Gaussian with unit variance.
fn gaussAt(cell: vec2i, seed: u32) -> f32 {
  let a = hash31(cell, seed);
  let b = hash31(cell, seed + 1013u);
  let c = hash31(cell, seed + 3037u);
  return (a + b + c - 1.5) * 2.0;
}

fn softenedNoise(p: vec2f, seed: u32, softness: f32) -> f32 {
  let center = vec2i(floor(p + vec2f(0.5)));
  let sigma = 0.7 + softness * 0.3;
  let falloff = 0.5 / (sigma * sigma);
  let boundary = exp(-4.0 * falloff);
  var sum = 0.0;
  var energy = 0.0;
  for (var y = -2; y <= 2; y++) {
    for (var x = -2; x <= 2; x++) {
      let cell = center + vec2i(x, y);
      let jitter = vec2f(hash31(cell, seed + 4001u), hash31(cell, seed + 8089u)) - vec2f(0.5);
      let delta = p - (vec2f(cell) + jitter);
      // Overlapping Gaussian lobes with independently jittered centers avoid
      // visible lattice cells. Subtract the radius-2 boundary so taps enter
      // and leave this 5x5 window continuously, including at full softness.
      let weight = max(0.0, exp(-(delta.x * delta.x + delta.y * delta.y) * falloff) - boundary);
      sum = sum + gaussAt(cell, seed) * weight;
      energy = energy + weight * weight;
    }
  }
  return sum / sqrt(energy);
}

fn grainAt(p: vec2f, seed: u32, roughness: f32, softness: f32) -> f32 {
  // Distinct rotations keep both octaves away from the image axes and from
  // each other's lattice. The fine octave is twice the spatial frequency.
  let coarseP = vec2f(p.x * 0.8 - p.y * 0.6, p.x * 0.6 + p.y * 0.8);
  let fineP = vec2f(p.x * 0.9238795 + p.y * 0.3826834, -p.x * 0.3826834 + p.y * 0.9238795) * 2.0;
  let coarse = softenedNoise(coarseP, seed, softness);
  let fine = softenedNoise(fineP + vec2f(17.0, 29.0), seed + 7919u, softness);
  return (coarse + roughness * fine) / sqrt(1.0 + roughness * roughness);
}

fn softLight(base: f32, blend: f32) -> f32 {
  if (blend <= 0.5) {
    return base - (1.0 - 2.0 * blend) * base * (1.0 - base);
  }
  var d = sqrt(base);
  if (base <= 0.25) {
    d = ((16.0 * base - 12.0) * base + 4.0) * base;
  }
  return base + (2.0 * blend - 1.0) * (d - base);
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coords = vec2i(gid.xy);
  let v = layout.$.params;
  let color = textureLoad(layout.$.source, coords, 0);
  if (color.a <= 0.0 || v.amount <= 0.0) {
    textureStore(layout.$.outputTexture, coords, color);
    return;
  }
  let folded = v.seed - 8192.0 * floor(v.seed / 8192.0);
  let seed = u32(folded);
  // Compensate for the wider overlapping kernel to retain fine size-1 grain.
  let p = (vec2f(gid.xy) / max(v.size, 1.0)) * 1.75;
  let roughness = clamp(v.roughness, 0.0, 1.0);
  let softness = clamp(v.softness, 0.0, 1.0);
  let mono = grainAt(p, seed, roughness, softness);
  var n = vec3f(mono);
  if (v.colorAmount > 0.0) {
    let perChannel = vec3f(
      grainAt(p, seed + 131u, roughness, softness),
      grainAt(p, seed + 262u, roughness, softness),
      grainAt(p, seed + 393u, roughness, softness)
    );
    n = n + (perChannel - n) * clamp(v.colorAmount, 0.0, 1.0);
  }
  let straight = color.rgb / color.a;
  let luma = dot(straight, vec3f(0.2126, 0.7152, 0.0722));
  let response = smoothstep(0.02, 0.28, luma) * (1.0 - smoothstep(0.72, 1.0, luma));
  let sigma = clamp(v.amount, 0.0, 1.0) * 0.2 * response;
  let blend = clamp(vec3f(0.5) + n * sigma, vec3f(0.0), vec3f(1.0));
  let grained = vec3f(softLight(straight.r, blend.r), softLight(straight.g, blend.g), softLight(straight.b, blend.b));
  textureStore(layout.$.outputTexture, coords, vec4f(clamp(grained, vec3f(0.0), vec3f(1.0)) * color.a, color.a));
}
`,
  io: {
    inputs: { source: { colorSpace: "srgb", alpha: "premultiplied", bindingKinds: ["texture_2d"] } },
    output: { colorSpace: "srgb", alpha: "premultiplied", format: "rgba8unorm", dimensions: "same-as:source" },
    rod: "same-as:source"
  }
});
