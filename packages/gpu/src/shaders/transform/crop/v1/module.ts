/**
 * `transform.crop@1` — sample a sub-rectangle of the source defined in
 * normalized UV space.
 *
 * `(originX, originY, width, height)` are all in `[0, 1]` with top-left
 * origin. Output dimensions are `derived` from the requested crop —
 * the host allocates a target sized `(source.width * width, source.height * height)`
 * (integer-rounded) and the module samples the corresponding region.
 *
 * Out-of-source samples (when the crop extends beyond `[0, 1]`) return
 * transparent black so a crop is a *crop*, not a stretch.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const CropParams = d.struct({
  originX: d.f32,
  originY: d.f32,
  width: d.f32,
  height: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: CropParams },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const transformCropV1 = defineModule({
  id: "transform.crop",
  version: 1,
  surface: "internal",
  category: "transform",
  linearity: "linear-in-rgb",
  kind: "fragment",
  params: CropParams,
  paramDefaults: { originX: 0, originY: 0, width: 1, height: 1 },
  paramUi: {
    originX: { min: 0, max: 1, step: 0.01, label: "Origin X" },
    originY: { min: 0, max: 1, step: 0.01, label: "Origin Y" },
    width: { min: 0.01, max: 1, step: 0.01, label: "Width" },
    height: { min: 0.01, max: 1, step: 0.01, label: "Height" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let sampleUv = vec2f(
    p.originX + uv.x * p.width,
    p.originY + uv.y * p.height
  );
  if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) {
    return vec4f(0.0);
  }
  return textureSample(layout.$.source, layout.$.samp, sampleUv);
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
      dimensions: "derived"
    },
    rod: "explicit"
  }
});
