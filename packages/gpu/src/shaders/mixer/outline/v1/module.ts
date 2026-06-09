/**
 * `mixer.outline@1` — flat outline / stroke around the source silhouette.
 *
 * Samples eight ring positions at radius `widthPx` (pixels, converted to UV
 * via `textureDimensions(source)`). Pixels outside the silhouette
 * (`source.a ≤ threshold`) that find any ring neighbour above threshold are
 * filled with the outline color; pixels inside the silhouette pass through.
 * The eight-tap ring is approximate but cheap and visually fine at small
 * widths — for wide, soft outlines, the recipe form (extract → blur →
 * composite) is the right tool.
 *
 * Output dimensions stay `same-as:source` — the outline lives inside the
 * source canvas. Sources that need outline room outside the original
 * silhouette should `transform.pad` first.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const OutlineParams = d.struct({
  color: d.vec4f,
  widthPx: d.f32,
  threshold: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: OutlineParams },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const mixerOutlineV1 = defineModule({
  id: "mixer.outline",
  version: 1,
  surface: "internal",
  category: "mixer",
  linearity: "nonlinear-in-rgb",
  kind: "fragment",
  params: OutlineParams,
  paramDefaults: { color: d.vec4f(0, 0, 0, 1), widthPx: 2, threshold: 0.5 },
  paramUi: {
    color: { label: "Color", notes: "RGBA, straight alpha" },
    widthPx: { min: 0, max: 32, step: 0.5, label: "Width", notes: "pixels" },
    threshold: { min: 0, max: 1, step: 0.01, label: "Alpha threshold" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let p = layout.$.params;
  let dims = vec2f(textureDimensions(layout.$.source));
  let step = p.widthPx / dims;
  // Eight ring samples, π/4 apart, at radius = widthPx. The loop runs
  // unconditionally so the ring textureSample stays in uniform control flow;
  // the result is gated by select() below rather than early returns.
  let dirs = array<vec2f, 8>(
    vec2f(1.0, 0.0),
    vec2f(0.70710678, 0.70710678),
    vec2f(0.0, 1.0),
    vec2f(-0.70710678, 0.70710678),
    vec2f(-1.0, 0.0),
    vec2f(-0.70710678, -0.70710678),
    vec2f(0.0, -1.0),
    vec2f(0.70710678, -0.70710678)
  );
  var maxA: f32 = 0.0;
  for (var i = 0; i < 8; i = i + 1) {
    let s = textureSample(layout.$.source, layout.$.samp, uv + dirs[i] * step);
    maxA = max(maxA, s.a);
  }
  let cov = p.color.a;
  let outline = vec4f(p.color.rgb * cov, cov);
  // Outside the silhouette with a ring neighbour above threshold → outline;
  // outside with no neighbour → transparent black.
  let edge = select(vec4f(0.0), outline, maxA > p.threshold);
  // widthPx <= 0 ("no outline") or inside the silhouette → pass source through.
  // widthPx is a uniform, but the source-alpha test is per-pixel, so both
  // collapse into a single uniform-control-flow select.
  let passthrough = p.widthPx <= 0.0 || src.a > p.threshold;
  return select(edge, src, passthrough);
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
