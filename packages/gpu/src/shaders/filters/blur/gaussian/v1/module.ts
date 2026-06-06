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
    // Capped at 20 to match the shader's `kernelRadius = min(radius, 20)`
    // cap; advertising a higher max silently truncated requests above 20.
    radius: { min: 0, max: 20, step: 0.5, label: "Radius", notes: "pixels" },
    sigma: { min: 0, max: 16, step: 0.1, label: "Sigma" },
    direction: { label: "Direction", notes: "(1,0) horizontal, (0,1) vertical" }
  },
  layout,
  workgroupSize: [16, 16, 1],
  wgsl: /* wgsl */ `
fn gaussianWeight(offset: f32, sigma: f32) -> f32 {
  let s2 = sigma * sigma;
  return exp(-(offset * offset) / (2.0 * s2)) / (sqrt(2.0 * 3.14159265) * sigma);
}

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

  let kernelRadius = i32(min(blur.radius, 20.0));
  // Honor an explicit positive sigma. Only fall back to radius/3 when the
  // caller leaves sigma unset (<= 0); the previous max(sigma, radius/3)
  // silently raised any explicit sigma smaller than radius/3.
  let sigma = select(blur.sigma, blur.radius / 3.0, blur.sigma <= 0.0);

  var colorSum = vec4<f32>(0.0);
  var weightSum: f32 = 0.0;
  for (var i = -kernelRadius; i <= kernelRadius; i = i + 1) {
    let offset = vec2<i32>(
      i32(blur.direction.x * f32(i)),
      i32(blur.direction.y * f32(i))
    );
    let s = vec2<i32>(
      clamp(coords.x + offset.x, 0, i32(dims.x) - 1),
      clamp(coords.y + offset.y, 0, i32(dims.y) - 1)
    );
    let w = gaussianWeight(f32(i), sigma);
    colorSum = colorSum + textureLoad(layout.$.source, s, 0) * w;
    weightSum = weightSum + w;
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
