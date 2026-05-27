/**
 * `transform.mirror@1` — flip horizontally, vertically, or both.
 *
 * `axes` packs the two flags into a single param: `1` → horizontal, `2` →
 * vertical, `3` → both. Output dimensions are `same-as:source`.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const MirrorParams = d.struct({
  axes: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: MirrorParams },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const transformMirrorV1 = defineModule({
  id: "transform.mirror",
  version: 1,
  surface: "internal",
  category: "transform",
  linearity: "linear-in-rgb",
  kind: "fragment",
  params: MirrorParams,
  paramDefaults: { axes: 1 },
  paramUi: {
    axes: {
      min: 0,
      max: 3,
      step: 1,
      label: "Axes",
      notes: "0 none / 1 H / 2 V / 3 both"
    }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let axes = i32(round(layout.$.params.axes));
  let flipH = (axes & 1) != 0;
  let flipV = (axes & 2) != 0;
  var u = uv;
  if (flipH) { u.x = 1.0 - u.x; }
  if (flipV) { u.y = 1.0 - u.y; }
  return textureSample(layout.$.source, layout.$.samp, u);
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
