/**
 * `filters.blur.gaussian@1` — separable Gaussian blur (one axis per dispatch).
 *
 * Migrated verbatim from the timeline preview's `blurComputeShader`. The host
 * runs it twice — horizontal (`direction = (1,0)`) then vertical
 * (`direction = (0,1)`) — sharing the same module. The hand-packed uniform is
 * replaced by the TypeGPU `BlurParams` schema; the kernel math is unchanged.
 *
 * RoD is `same-as:source` for now; a real expand-by-radius declaration lands
 * when a consumer needs region propagation (Phase 3+).
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../../module.js";

export const BlurParams = d.struct({
  radius: d.f32,
  sigma: d.f32,
  direction: d.vec2f
});

const layout = tgpu.bindGroupLayout({
  source: { texture: "float" },
  outputTexture: { storageTexture: "rgba8unorm" },
  params: { uniform: BlurParams }
});

export const blurGaussianV1 = defineModule({
  precision: { "source": "working-or-mask", "output": "working-or-mask" },
  id: "filters.blur.gaussian",
  version: 1,
  // Promoted in Phase 3: separable gaussian blur with a stable
  // (radius, sigma, direction) schema; consumed by Phase 2 timeline +
  // Phase 3 `filters.glow` recipe.
  surface: "published",
  category: "filters",
  linearity: "linear-in-rgb",
  kind: "compute",
  params: BlurParams,
  paramDefaults: { radius: 0, sigma: 0, direction: d.vec2f(1, 0) },
  paramUi: {
    radius: { min: 0, max: 256, step: 0.5, label: "Radius", notes: "pixels" },
    sigma: { min: 0, max: 96, step: 0.1, label: "Sigma" },
    direction: { label: "Direction", notes: "(1,0) horizontal, (0,1) vertical" }
  },
  layout,
  workgroupSize: [16, 16, 1],
  wgsl: /* wgsl */ `
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));
  let blur = layout.$.params;

  if (blur.radius < 0.5) {
    textureStore(layout.$.outputTexture, coords, textureLoad(layout.$.source, coords, 0));
    return;
  }

  // Visit every texel in the supported radius. Spaced taps alias thin lines.
  let kernelRadius = i32(min(blur.radius, 256.0));
  // Honor an explicit positive sigma. Only fall back to radius/3 when the
  // caller leaves sigma unset (<= 0); the previous max(sigma, radius/3)
  // silently raised any explicit sigma smaller than radius/3.
  let sigma = select(blur.sigma, min(blur.radius, 256.0) / 3.0, blur.sigma <= 0.0);

  var colorSum = textureLoad(layout.$.source, coords, 0);
  var weightSum = 1.0;
  // Center-out recurrence avoids one exponential per tap and stays finite
  // for narrow sigmas whose outer weights underflow to zero.
  var weight = 1.0;
  var ratio = exp(-0.5 / (sigma * sigma));
  let ratioStep = ratio * ratio;
  for (var i = 1; i <= kernelRadius; i = i + 1) {
    weight = weight * ratio;
    ratio = ratio * ratioStep;
    let distance = f32(i);
    let offset = vec2<i32>(
      i32(round(blur.direction.x * distance)),
      i32(round(blur.direction.y * distance))
    );
    let hi = vec2<i32>(dims) - vec2<i32>(1);
    let a = clamp(coords + offset, vec2<i32>(0), hi);
    let b = clamp(coords - offset, vec2<i32>(0), hi);
    colorSum = colorSum + (textureLoad(layout.$.source, a, 0) + textureLoad(layout.$.source, b, 0)) * weight;
    weightSum = weightSum + 2.0 * weight;
  }
  textureStore(layout.$.outputTexture, coords, colorSum / weightSum);
}
`,
  io: {
    inputs: {
      source: {
        // Aligned with the `filters.blur.gaussianSeparable` and `filters.glow`
        // recipes that route through this module; the blur math itself is
        // colour-space agnostic (a normalized weighted sum).
        colorSpace: "encoded-sdr",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"]
      }
    },
    output: {
      colorSpace: "encoded-sdr",
      alpha: "premultiplied",
      format: "rgba8unorm",
      dimensions: "same-as:source"
    },
    rod: "same-as:source"
  }
});
