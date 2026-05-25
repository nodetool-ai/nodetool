/**
 * Canary module — `_canary.passthrough@1`.
 *
 * Copies an input texture to an output texture, modulated by a `tint` uniform
 * that defaults to white (an identity copy). It exists to prove the whole
 * Phase 1 chain end-to-end in one file: TypeGPU schema → bind group layout →
 * WGSL resolution → executor → labeled output. Not a published operation.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

const PassthroughParams = d.struct({
  tint: d.vec4f
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: PassthroughParams },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

export const passthroughV1 = defineModule({
  id: "_canary.passthrough",
  version: 1,
  surface: "internal",
  category: "_canary",
  kind: "fragment",
  params: PassthroughParams,
  paramDefaults: { tint: d.vec4f(1, 1, 1, 1) },
  paramUi: {
    tint: { label: "Tint", notes: "RGBA multiplier; white = identity copy" }
  },
  layout,
  samplers: {
    samp: {
      magFilter: "nearest",
      minFilter: "nearest",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge"
    }
  },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let c = textureSample(layout.$.source, layout.$.samp, uv);
  return c * layout.$.params.tint;
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
