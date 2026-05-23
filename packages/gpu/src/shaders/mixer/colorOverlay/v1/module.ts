/**
 * `mixer.colorOverlay@1` — flat colour applied across the source, masked by
 * source coverage.
 *
 * The "Color Overlay" layer-effect from sketch / image-editor vocabulary: a
 * constant RGBA fill is mixed over the source, but only where the source has
 * coverage so the overlay never spills outside the image's silhouette.
 * Premultiplied alpha throughout; `amount` controls the mix strength
 * (`0` passthrough, `1` full overlay).
 *
 * `color` is supplied straight (R, G, B, opacity) — the shader does the
 * premultiplication. This matches the workflow-node UX of picking an
 * "overlay color" with an "opacity" slider, rather than asking the user to
 * think in premultiplied space.
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
  // Premultiply the overlay color and mask it by source coverage so the
  // overlay only paints inside the source's existing silhouette.
  let overlay = vec4f(p.color.rgb * p.color.a, p.color.a) * src.a;
  return mix(src, overlay, p.amount);
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
