/**
 * `filters.grain@1` — film grain modelled on exposed stock.
 *
 * **Bell-shaped, clumped, two octaves.** Each lattice point draws roughly
 * Gaussian noise (three hashes summed), and smooth value noise interpolates
 * between points, so `size` grows soft clumps rather than square blocks. A
 * second octave at twice the frequency adds the fine layer real grain has.
 *
 * **Follows exposure.** The noise is added to the straight colour and weighted
 * by luma: zero in pure black, strongest through shadows and midtones, thinner
 * in the highlights. The result is clamped to 0..1 and premultiplied again, so
 * `rgb <= a` holds by construction on a translucent layer.
 *
 * **Reproducible.** The pattern is a hash of the lattice and `seed`, with no
 * clock and no RNG state, so two renders of the same frame are byte-identical
 * and a cached render can be handed back. A host that wants the pattern to roll
 * passes the frame's own time as the seed; the shader folds it into a small
 * exact integer so large frame times keep their precision.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const GrainParams = d.struct({
  /** Grain strength, 0..1. 1 is a 0.15 deviation in midtones. 0 is a no-op. */
  amount: d.f32,
  /** Grain clump size in source pixels. 1 is per-pixel; larger is softer, coarser stock. */
  size: d.f32,
  /** 0 = one noise value for the pixel (monochrome), 1 = per-channel colour noise. */
  colorAmount: d.f32,
  /** Rolls the pattern. Same seed, same grain. */
  seed: d.f32
});

const layout = tgpu.bindGroupLayout({
  source: { texture: "float" },
  outputTexture: { storageTexture: "rgba8unorm" },
  params: { uniform: GrainParams }
});

export const filtersGrainV1 = defineModule({
  id: "filters.grain",
  version: 1,
  surface: "internal",
  category: "filters",
  // A per-channel scale of premultiplied RGB, saturated against alpha — the
  // same shape `filters.vignette@1` is tagged for.
  linearity: "linear-in-rgb",
  kind: "compute",
  params: GrainParams,
  paramDefaults: { amount: 0, size: 1, colorAmount: 0, seed: 0 },
  paramUi: {
    amount: { min: 0, max: 1, step: 0.01, label: "Amount" },
    size: { min: 1, max: 16, step: 0.5, label: "Size" },
    colorAmount: { min: 0, max: 1, step: 0.01, label: "Colour" },
    seed: { label: "Seed" }
  },
  layout,
  workgroupSize: [16, 16, 1],
  wgsl: /* wgsl */ `
fn hash31(p: vec3f) -> f32 {
  var p3 = fract(p * 0.1031);
  p3 = p3 + dot(p3, vec3f(p3.y, p3.z, p3.x) + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/**
 * Approximately Gaussian noise with unit deviation at one lattice point: the
 * sum of three uniform hashes (Irwin-Hall), centred and rescaled. Real grain is
 * the sum of many silver crystals, so its density is bell-shaped, not flat.
 */
fn gaussAt(cell: vec2f, seed: f32) -> f32 {
  let a = hash31(vec3f(cell.x, cell.y, seed));
  let b = hash31(vec3f(cell.x + 57.0, cell.y + 57.0, seed));
  let c = hash31(vec3f(cell.x + 113.0, cell.y + 113.0, seed));
  return (a + b + c - 1.5) * 2.0;
}

/**
 * Smooth value noise over the grain lattice. Interpolating between lattice
 * points turns a large size into soft clumps instead of hard square blocks. At
 * integer coordinates the weights are exactly zero, so size 1 returns the
 * lattice value itself: fine, per-pixel grain.
 */
fn valueNoise(p: vec2f, seed: f32) -> f32 {
  let i = floor(p);
  let f = p - i;
  let u = f * f * (vec2f(3.0) - 2.0 * f);
  let n00 = gaussAt(i, seed);
  let n10 = gaussAt(i + vec2f(1.0, 0.0), seed);
  let n01 = gaussAt(i + vec2f(0.0, 1.0), seed);
  let n11 = gaussAt(i + vec2f(1.0, 1.0), seed);
  return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
}

/**
 * Two octaves: the clump at the chosen size and a finer layer at twice the
 * frequency. The doubling and the fixed offset keep every floored coordinate an
 * exact float, so the CPU mirror can reproduce the lattice bit for bit.
 */
fn grainAt(p: vec2f, seed: f32, channel: f32) -> f32 {
  let s = seed + channel * 19.19;
  let coarse = valueNoise(p, s);
  let fine = valueNoise(p * 2.0 + vec2f(17.0, 29.0), s + 7.0);
  return (coarse + 0.5 * fine) * 0.8944;
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));
  let v = layout.$.params;
  let color = textureLoad(layout.$.source, coords, 0);
  if (color.a <= 0.0) {
    textureStore(layout.$.outputTexture, coords, color);
    return;
  }

  // Fold the seed into a small exact integer, then turn it into a whole-pixel
  // shift of the lattice. Frame-time seeds run into the hundreds of thousands,
  // where f32 hashing loses the bits that make consecutive frames differ.
  let folded = v.seed - 8192.0 * floor(v.seed / 8192.0);
  let shift = floor(vec2f(
    hash31(vec3f(folded, 1.7, 9.2)),
    hash31(vec3f(folded, 4.1, 3.3))
  ) * 512.0);
  let p = vec2f(f32(gid.x), f32(gid.y)) / max(v.size, 1.0) + shift;

  let mono = grainAt(p, folded, 0.0);
  var n = vec3f(mono);
  if (v.colorAmount > 0.0) {
    let perChannel = vec3f(
      grainAt(p, folded, 1.0),
      grainAt(p, folded, 2.0),
      grainAt(p, folded, 3.0)
    );
    n = mix(n, perChannel, clamp(v.colorAmount, 0.0, 1.0));
  }

  // Work on the straight colour: grain follows exposure, not coverage.
  let straight = color.rgb / color.a;
  let luma = dot(straight, vec3f(0.2126, 0.7152, 0.0722));
  // Film response: nothing to expose in pure black, strongest through the
  // shadows and midtones, thinning out toward the highlights.
  let response = clamp(luma * 6.0, 0.0, 1.0) * (1.0 - 0.65 * luma * luma);
  let sigma = clamp(v.amount, 0.0, 1.0) * 0.15 * response;
  let grained = clamp(straight + n * sigma, vec3f(0.0), vec3f(1.0));
  // Re-premultiplying a value in 0..1 keeps rgb <= a by construction.
  textureStore(layout.$.outputTexture, coords, vec4<f32>(grained * color.a, color.a));
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
