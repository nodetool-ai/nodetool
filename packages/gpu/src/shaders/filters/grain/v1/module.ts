/**
 * `filters.grain@1` — film grain as a multiplicative gain wobble.
 *
 * **Multiplied, not added.** The input is premultiplied, so `rgb <= a` holds on
 * every pixel and adding noise would break it: a translucent layer would come
 * back with channels brighter than its own alpha, which reads as a bright
 * fringe once it composites. A scalar gain preserves the invariant (the same
 * reason `filters.vignette@1` may scale), and it is also closer to how exposed
 * stock behaves — grain bites in the midtones and leaves black black, because
 * there is nothing there to modulate.
 *
 * **Reproducible.** The pattern is a hash of the grain cell and `seed`, with no
 * clock and no RNG state, so two renders of the same frame are byte-identical
 * and a cached render can be handed back. A host that wants the pattern to roll
 * passes the frame's own time as the seed.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const GrainParams = d.struct({
  /** Gain wobble, 0..1. 0 leaves the picture untouched. */
  amount: d.f32,
  /** Grain cell size in source pixels. 1 is per-pixel. */
  size: d.f32,
  /** 0 = one gain for the pixel (monochrome), 1 = per-channel colour noise. */
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

/** Signed noise in [-1, 1] for one grain cell and channel. */
fn grainAt(cell: vec2f, seed: f32, channel: f32) -> f32 {
  return hash31(vec3f(cell.x, cell.y, seed + channel * 19.19)) * 2.0 - 1.0;
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));
  let v = layout.$.params;
  let color = textureLoad(layout.$.source, coords, 0);

  // Quantize to grain cells so size coarsens the stock instead of just
  // reseeding it. Sub-pixel sizes collapse back to per-pixel.
  let cell = floor(vec2f(f32(gid.x), f32(gid.y)) / max(v.size, 1.0));

  let mono = grainAt(cell, v.seed, 0.0);
  let perChannel = vec3f(
    grainAt(cell, v.seed, 1.0),
    grainAt(cell, v.seed, 2.0),
    grainAt(cell, v.seed, 3.0)
  );
  let n = mix(vec3f(mono), perChannel, clamp(v.colorAmount, 0.0, 1.0));

  let gain = vec3f(1.0) + n * clamp(v.amount, 0.0, 1.0);
  // Saturating against alpha rather than 1.0 is what keeps rgb <= a when the
  // gain runs above 1 on an already-bright premultiplied pixel.
  let rgb = clamp(color.rgb * gain, vec3f(0.0), vec3f(color.a)); // premul: ok
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
