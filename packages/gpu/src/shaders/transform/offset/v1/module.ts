/**
 * `transform.offset@1` — translate the source by a normalized UV offset,
 * with the address mode controlled by `wrap` (`0` clamp-to-edge,
 * `1` repeat, `2` mirror-repeat).
 *
 * `dx`/`dy` are in normalized UV units (`0..1`). Output dimensions are
 * `same-as:source`; for `wrap = 0`, regions outside the original sample
 * area return the edge color (so they don't introduce transparent pixels).
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const OffsetParams = d.struct({
  dx: d.f32,
  dy: d.f32,
  wrap: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: OffsetParams },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  // We pick the address mode in the shader so a single sampler binding
  // covers all three wrap behaviors; the sampler stays clamp-to-edge.
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const transformOffsetV1 = defineModule({
  id: "transform.offset",
  version: 1,
  surface: "internal",
  category: "transform",
  linearity: "linear-in-rgb",
  kind: "fragment",
  params: OffsetParams,
  paramDefaults: { dx: 0, dy: 0, wrap: 0 },
  paramUi: {
    dx: { min: -1, max: 1, step: 0.01, label: "Offset X" },
    dy: { min: -1, max: 1, step: 0.01, label: "Offset Y" },
    wrap: { min: 0, max: 2, step: 1, label: "Wrap", notes: "0 clamp / 1 repeat / 2 mirror" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
fn applyWrap(u: vec2f, mode: i32) -> vec2f {
  if (mode == 1) {
    return fract(u);
  }
  if (mode == 2) {
    let q = fract(u * 0.5) * 2.0;
    return vec2f(
      select(q.x, 2.0 - q.x, q.x > 1.0),
      select(q.y, 2.0 - q.y, q.y > 1.0)
    );
  }
  return clamp(u, vec2f(0.0), vec2f(1.0));
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let mode = i32(round(p.wrap));
  let shifted = uv - vec2f(p.dx, p.dy);
  let u = applyWrap(shifted, mode);
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
