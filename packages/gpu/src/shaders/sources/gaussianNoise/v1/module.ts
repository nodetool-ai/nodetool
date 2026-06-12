/**
 * `sources.gaussianNoise@1` — fill the output with per-channel Gaussian noise.
 *
 * Zero-input source (host-specified dimensions). Each channel gets an
 * independent sample drawn via the Box-Muller transform from a hash-based RNG
 * keyed by pixel position + `seed`, then mapped to [0,1] as
 * `((mean + g*stddev) * 128 + 128) / 255` (matching the legacy CPU node). Pass a
 * fresh `seed` per run for run-to-run variation. Output is opaque.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const GaussianNoiseParams = d.struct({
  mean: d.f32,
  stddev: d.f32,
  seed: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: GaussianNoiseParams }
});

export const sourcesGaussianNoiseV1 = defineModule({
  id: "sources.gaussianNoise",
  version: 1,
  surface: "internal",
  category: "sources",
  linearity: "source",
  kind: "fragment",
  params: GaussianNoiseParams,
  paramDefaults: { mean: 0, stddev: 1, seed: 0 },
  paramUi: {
    mean: { min: -1, max: 1, step: 0.01, label: "Mean" },
    stddev: { min: 0, max: 4, step: 0.01, label: "Std Dev" },
    seed: { label: "Seed" }
  },
  layout,
  wgsl: /* wgsl */ `
fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, vec3f(p3.y, p3.z, p3.x) + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn gauss(p: vec2f, seed: f32) -> f32 {
  let u1 = max(1e-6, hash21(p + vec2f(seed, 0.0)));
  let u2 = hash21(p + vec2f(0.0, seed));
  return sqrt(-2.0 * log(u1)) * cos(6.28318530718 * u2);
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = uv * 4096.0;
  let m = layout.$.params.mean;
  let s = layout.$.params.stddev;
  let base = layout.$.params.seed;
  let r = clamp(((m + gauss(p, base + 1.0) * s) * 128.0 + 128.0) / 255.0, 0.0, 1.0);
  let g = clamp(((m + gauss(p, base + 2.0) * s) * 128.0 + 128.0) / 255.0, 0.0, 1.0);
  let b = clamp(((m + gauss(p, base + 3.0) * s) * 128.0 + 128.0) / 255.0, 0.0, 1.0);
  return vec4f(r, g, b, 1.0);
}
`,
  io: {
    inputs: {},
    output: {
      colorSpace: "linear",
      alpha: "premultiplied",
      format: "rgba8unorm",
      dimensions: "host-specified"
    },
    rod: "explicit"
  }
});
