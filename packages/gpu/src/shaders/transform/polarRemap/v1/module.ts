/**
 * `transform.polarRemap@1` — convert between rectangular and polar UV space.
 *
 * `mode = 0` rect→polar: the output `x` axis is angle (`[0, 2π)`) and the
 * output `y` axis is radius (`[0, 1]`). `mode = 1` polar→rect: treat the
 * source as `(angle, radius)` and unwrap it into a centered disc.
 *
 * Used for "polar coordinates" filters, kaleidoscopes, and as the building
 * block for fisheye fronts. Output dimensions stay `same-as:source` —
 * sampling is symmetrical between the two modes, so the host doesn't have to
 * resize.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const PolarRemapParams = d.struct({
  mode: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: PolarRemapParams },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const transformPolarRemapV1 = defineModule({
  id: "transform.polarRemap",
  version: 1,
  surface: "internal",
  category: "transform",
  kind: "fragment",
  params: PolarRemapParams,
  paramDefaults: { mode: 0 },
  paramUi: {
    mode: {
      min: 0,
      max: 1,
      step: 1,
      label: "Mode",
      notes: "0 rect→polar / 1 polar→rect"
    }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let mode = i32(round(layout.$.params.mode));
  let pi = 3.14159265358979;
  if (mode == 0) {
    // rect → polar: output (x, y) lives in (angle, radius) space.
    // Sample the source at the cartesian position that maps to (angle, r).
    let angle = uv.x * (2.0 * pi);
    let r = uv.y;
    let s = vec2f(0.5 + r * 0.5 * cos(angle), 0.5 + r * 0.5 * sin(angle));
    return textureSample(layout.$.source, layout.$.samp, s);
  }
  // polar → rect: treat the source's u-axis as angle and v-axis as radius.
  // Output is a centered disc; convert this output's cartesian (uv) to (r,θ)
  // and sample the source there.
  let centered = uv - vec2f(0.5);
  let r = length(centered) * 2.0;
  if (r > 1.0) {
    return vec4f(0.0);
  }
  var angle = atan2(centered.y, centered.x);
  if (angle < 0.0) {
    angle = angle + 2.0 * pi;
  }
  return textureSample(layout.$.source, layout.$.samp, vec2f(angle / (2.0 * pi), r));
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
