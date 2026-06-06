/**
 * `transform.resize@1` — resample the source onto a host-specified target.
 *
 * `mode` picks the algorithm: `0` nearest-neighbour (point sample, pixel-art
 * safe), `1` bilinear (default), `2` bicubic (Catmull–Rom). Output dimensions
 * are `host-specified` — the host allocates whatever target size it wants;
 * the shader maps each output pixel back to source UV space and samples.
 *
 * Bilinear uses the bound `filtering` sampler. Nearest snaps UVs to source
 * texel centers with the same sampler (one binding rather than two). Bicubic
 * implements a 4×4 Catmull–Rom kernel in WGSL.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const ResizeParams = d.struct({
  mode: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: ResizeParams },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const transformResizeV1 = defineModule({
  id: "transform.resize",
  version: 1,
  surface: "internal",
  category: "transform",
  linearity: "linear-in-rgb",
  kind: "fragment",
  params: ResizeParams,
  paramDefaults: { mode: 1 },
  paramUi: {
    mode: {
      min: 0,
      max: 2,
      step: 1,
      label: "Mode",
      notes: "0 nearest / 1 bilinear / 2 bicubic"
    }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
fn cubicWeight(x: f32) -> f32 {
  // Catmull–Rom (a = -0.5). Symmetric in x.
  let ax = abs(x);
  if (ax < 1.0) {
    return ((1.5 * ax - 2.5) * ax * ax) + 1.0;
  }
  if (ax < 2.0) {
    return (((-0.5 * ax + 2.5) * ax - 4.0) * ax) + 2.0;
  }
  return 0.0;
}

fn sampleBicubic(uv: vec2f, dims: vec2f) -> vec4f {
  // Map UV → texel-center coords, take floor as the kernel anchor, sweep the
  // surrounding 4×4 neighborhood and accumulate weighted samples.
  let center = uv * dims - vec2f(0.5);
  let baseI = floor(center);
  let frac = center - baseI;
  var color = vec4f(0.0);
  var weight: f32 = 0.0;
  for (var j = -1; j <= 2; j = j + 1) {
    let wy = cubicWeight(f32(j) - frac.y);
    for (var i = -1; i <= 2; i = i + 1) {
      let wx = cubicWeight(f32(i) - frac.x);
      let w = wx * wy;
      let texel = baseI + vec2f(f32(i), f32(j)) + vec2f(0.5);
      let u = clamp(texel / dims, vec2f(0.0), vec2f(1.0));
      color = color + textureSample(layout.$.source, layout.$.samp, u) * w;
      weight = weight + w;
    }
  }
  return color / weight;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let mode = i32(round(layout.$.params.mode));
  let dims = vec2f(textureDimensions(layout.$.source));
  if (mode == 0) {
    let snapped = (floor(uv * dims) + vec2f(0.5)) / dims;
    return textureSample(layout.$.source, layout.$.samp, snapped);
  }
  if (mode == 2) {
    return sampleBicubic(uv, dims);
  }
  return textureSample(layout.$.source, layout.$.samp, uv);
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
      dimensions: "host-specified"
    },
    rod: "explicit"
  }
});
