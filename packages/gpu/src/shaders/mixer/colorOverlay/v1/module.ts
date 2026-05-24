/**
 * `mixer.colorOverlay@1` — flat colour applied across the source, masked by
 * source coverage.
 *
 * The "Color Overlay" layer-effect from sketch / image-editor vocabulary: a
 * constant RGB fill is mixed into the source's colours but the output
 * **silhouette (alpha) is preserved** — the overlay never spills outside
 * the source, and never erodes its coverage either. `amount` controls the
 * RGB mix strength (`0` passthrough, `1` full overlay) and is scaled by the
 * picker's `color.a`, so a half-opacity colour applied at full amount
 * behaves like a fully-opaque colour at half amount.
 *
 * `color` is supplied straight (R, G, B, opacity) — the shader handles
 * un/re-premultiplication so the output stays premultiplied per the pool
 * convention.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const ColorOverlayParams = d.struct({
  color: d.vec4f,
  amount: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: ColorOverlayParams },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const mixerColorOverlayV1 = defineModule({
  id: "mixer.colorOverlay",
  version: 1,
  surface: "internal",
  category: "mixer",
  kind: "fragment",
  params: ColorOverlayParams,
  paramDefaults: { color: d.vec4f(1, 0, 0, 1), amount: 0.5 },
  paramUi: {
    color: { label: "Color", notes: "RGBA, straight alpha" },
    amount: { min: 0, max: 1, step: 0.01, label: "Amount" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let p = layout.$.params;
  // Blend RGB in straight space, then re-premultiply against the source's
  // own coverage. The output silhouette stays = src.a regardless of color.a
  // or amount — overlay opacity affects colour, not coverage.
  let safeA = max(src.a, 0.0001);
  let straightRgb = src.rgb / safeA;
  let mixedStraight = mix(straightRgb, p.color.rgb, clamp(p.amount * p.color.a, 0.0, 1.0));
  return vec4f(mixedStraight * src.a, src.a);
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
