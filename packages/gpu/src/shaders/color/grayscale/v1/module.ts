/**
 * `color.grayscale@1` — collapse RGB to luminance.
 *
 * `output.rgb = vec3(luma)` with the standard Rec.709 coefficients
 * `(0.2126, 0.7152, 0.0722)`. Alpha preserved. Honours the canonical mask
 * slot so workflows can grayscale a region while the rest stays colored.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const GrayscaleParams = d.struct({
  amount: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: GrayscaleParams },
  source: { texture: "float" },
  mask: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const colorGrayscaleV1 = defineModule({
  id: "color.grayscale",
  version: 1,
  // Internal for now — promoted to `published` once a workflow node ships
  // against it and the surface-promotion review is recorded. See
  // `tests/surfacePromotion.test.ts` for the published-set contract.
  surface: "internal",
  category: "color",
  kind: "fragment",
  params: GrayscaleParams,
  paramDefaults: { amount: 1 },
  paramUi: {
    amount: { min: 0, max: 1, step: 0.01, label: "Amount" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let luma = dot(src.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let gray = vec3f(luma);
  let mixed = mix(src.rgb, gray, coverage * layout.$.params.amount);
  return vec4f(mixed, src.a);
}
`,
  io: {
    inputs: {
      source: {
        colorSpace: "linear",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"]
      },
      mask: {
        colorSpace: "linear",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"],
        optional: true
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
