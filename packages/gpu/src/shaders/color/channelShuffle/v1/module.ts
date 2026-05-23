/**
 * `color.channelShuffle@1` — permute / rebroadcast source channels onto the
 * output.
 *
 * Four integer indices (`rFrom`, `gFrom`, `bFrom`, `aFrom`) pick which input
 * channel feeds each output channel: `0` R, `1` G, `2` B, `3` A. The
 * identity permutation `(0, 1, 2, 3)` is passthrough; common swaps include
 * RGB↔BGR (`2, 1, 0, 3`) and "alpha to grayscale" (`3, 3, 3, 3`).
 *
 * Premultiplication: the pool's contract is that alpha is premultiplied
 * between modules, so the shader un-premultiplies the source's RGB by its
 * original alpha before picking, then re-premultiplies the result by the
 * shuffled output alpha. That keeps the canonical premultiplied invariant
 * intact regardless of which input channel `aFrom` points at.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const ChannelShuffleParams = d.struct({
  rFrom: d.f32,
  gFrom: d.f32,
  bFrom: d.f32,
  aFrom: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: ChannelShuffleParams },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const colorChannelShuffleV1 = defineModule({
  id: "color.channelShuffle",
  version: 1,
  surface: "internal",
  category: "color",
  kind: "fragment",
  params: ChannelShuffleParams,
  paramDefaults: { rFrom: 0, gFrom: 1, bFrom: 2, aFrom: 3 },
  paramUi: {
    rFrom: { min: 0, max: 3, step: 1, label: "R ← channel", notes: "0 R / 1 G / 2 B / 3 A" },
    gFrom: { min: 0, max: 3, step: 1, label: "G ← channel", notes: "0 R / 1 G / 2 B / 3 A" },
    bFrom: { min: 0, max: 3, step: 1, label: "B ← channel", notes: "0 R / 1 G / 2 B / 3 A" },
    aFrom: { min: 0, max: 3, step: 1, label: "A ← channel", notes: "0 R / 1 G / 2 B / 3 A" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
fn pick(src: vec4f, idx: i32) -> f32 {
  if (idx == 0) { return src.r; }
  if (idx == 1) { return src.g; }
  if (idx == 2) { return src.b; }
  return src.a;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let p = layout.$.params;
  // Un-premultiply by the source alpha so channels are picked in straight
  // space, then re-premultiply by the chosen output alpha — keeps the pool's
  // premultiplied-between-modules invariant regardless of aFrom.
  let safeA = max(src.a, 0.0001);
  let straight = vec4f(src.rgb / safeA, src.a);
  let outA = pick(straight, i32(round(p.aFrom)) & 3);
  let outR = pick(straight, i32(round(p.rFrom)) & 3) * outA;
  let outG = pick(straight, i32(round(p.gFrom)) & 3) * outA;
  let outB = pick(straight, i32(round(p.bFrom)) & 3) * outA;
  return vec4f(outR, outG, outB, outA);
}
`,
  io: {
    inputs: {
      source: {
        colorSpace: "linear",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"]
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
