/**
 * `mixer.over@1` — Porter-Duff source-over composite of `over` onto `source`.
 *
 * Premultiplied alpha throughout: `out = over*opacity + source*(1 - over.a*opacity)`.
 * `opacity` scales the overlay (default 1). Both inputs are sampled at the same
 * UV, so callers place/resize the overlay onto the source's canvas first (e.g.
 * `transform.pad`). Output is `same-as:source`.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const OverParams = d.struct({
  opacity: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: OverParams },
  source: { texture: "float" },
  over: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const mixerOverV1 = defineModule({
  id: "mixer.over",
  version: 1,
  surface: "internal",
  category: "mixer",
  linearity: "linear-in-rgb",
  kind: "fragment",
  params: OverParams,
  paramDefaults: { opacity: 1 },
  paramUi: {
    opacity: { min: 0, max: 1, step: 0.01, label: "Opacity" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let s = textureSample(layout.$.source, layout.$.samp, uv);
  let o = textureSample(layout.$.over, layout.$.samp, uv) * layout.$.params.opacity;
  return o + s * (1.0 - o.a);
}
`,
  io: {
    inputs: {
      source: {
        colorSpace: "linear",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"]
      },
      over: {
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
