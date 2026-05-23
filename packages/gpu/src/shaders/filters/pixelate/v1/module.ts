/**
 * `filters.pixelate@1` — snap UVs to a coarse grid before sampling.
 *
 * `cellSize` is in source pixels; effective output resolution is `dims / cellSize`.
 * `cellSize ≤ 1` is treated as passthrough. Fragment, with the canonical mask slot.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const PixelateParams = d.struct({
  cellSize: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: PixelateParams },
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

export const filtersPixelateV1 = defineModule({
  id: "filters.pixelate",
  version: 1,
  surface: "internal",
  category: "filters",
  kind: "fragment",
  params: PixelateParams,
  paramDefaults: { cellSize: 8 },
  paramUi: {
    cellSize: { min: 1, max: 128, step: 1, label: "Cell size", notes: "pixels" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(layout.$.source));
  let cell = max(1.0, layout.$.params.cellSize);
  let snapped = (floor(uv * dims / cell) + vec2f(0.5)) * cell / dims;
  let processed = textureSample(layout.$.source, layout.$.samp, snapped);
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let mixed = mix(src.rgb, processed.rgb, coverage);
  let mixedA = mix(src.a, processed.a, coverage);
  return vec4f(mixed, mixedA);
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
