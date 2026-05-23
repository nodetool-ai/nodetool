/**
 * `mask.invert@1` — `output.a = 1 - mask.a`, RGB zeroed.
 *
 * The pool's masks are alpha-coverage textures. Invert is its own module
 * (rather than a flag on every consumer) because chaining mask ops cleanly is
 * a frequent enough pattern. Fragment.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

const NoParams = d.struct({ unused: d.f32 });

const layout = tgpu.bindGroupLayout({
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const maskInvertV1 = defineModule({
  id: "mask.invert",
  version: 1,
  surface: "internal",
  category: "mask",
  kind: "fragment",
  params: NoParams,
  paramDefaults: { unused: 0 },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  return vec4f(0.0, 0.0, 0.0, clamp(1.0 - src.a, 0.0, 1.0));
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
