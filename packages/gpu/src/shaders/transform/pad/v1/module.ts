/**
 * `transform.pad@1` — pad the source with empty space on each side.
 *
 * `left`/`top`/`right`/`bottom` are in normalized UV units relative to the
 * source: `left = 0.25` adds a quarter-source-width of empty space on the
 * left. Output dimensions are `derived` — the host allocates a target sized
 * `(source.w * (1 + left + right), source.h * (1 + top + bottom))`. The
 * padded region samples as `color` (premultiplied); the source occupies the
 * interior rectangle.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const PadParams = d.struct({
  left: d.f32,
  top: d.f32,
  right: d.f32,
  bottom: d.f32,
  color: d.vec4f
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: PadParams },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const transformPadV1 = defineModule({
  id: "transform.pad",
  version: 1,
  surface: "internal",
  category: "transform",
  kind: "fragment",
  params: PadParams,
  paramDefaults: {
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    color: d.vec4f(0, 0, 0, 0)
  },
  paramUi: {
    left: { min: 0, max: 4, step: 0.01, label: "Left", notes: "× source width" },
    top: { min: 0, max: 4, step: 0.01, label: "Top", notes: "× source height" },
    right: { min: 0, max: 4, step: 0.01, label: "Right", notes: "× source width" },
    bottom: { min: 0, max: 4, step: 0.01, label: "Bottom", notes: "× source height" },
    color: { label: "Fill color", notes: "RGBA, premultiplied" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let totalW = 1.0 + p.left + p.right;
  let totalH = 1.0 + p.top + p.bottom;
  let uMin = p.left / totalW;
  let uMax = (p.left + 1.0) / totalW;
  let vMin = p.top / totalH;
  let vMax = (p.top + 1.0) / totalH;
  if (uv.x < uMin || uv.x > uMax || uv.y < vMin || uv.y > vMax) {
    return p.color;
  }
  let sampleUv = vec2f(
    (uv.x - uMin) / (uMax - uMin),
    (uv.y - vMin) / (vMax - vMin)
  );
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
