/**
 * `filters.convolve3x3@1` — generic 3×3 convolution.
 *
 * Nine weights laid out row-major (top-left, top, top-right, …), an explicit
 * `divisor` (auto-derived when set to 0 from the sum of weights), and a
 * channel offset added after division. Covers PIL's edge/sharpen/smooth/
 * emboss family without a bespoke shader per kernel.
 *
 * Fragment, mask-slot honoured. Alpha is preserved (the kernel applies to
 * RGB only) so the same shader works for both opaque and translucent inputs.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const Convolve3x3Params = d.struct({
  // Weights in row-major order: w00 w01 w02 / w10 w11 w12 / w20 w21 w22.
  // Packed into three vec4f's for std140-friendly alignment. The kernel
  // weights live in the first three components of each row (`xyz`); the
  // trailing `w` of `row0` carries `offset`, `row1.w` is unused, and
  // `row2.w` carries `divisor` (set to 0 to auto-derive from the kernel
  // sum). Keeping the schema tight (3 × vec4f) avoids a vec4f array of
  // length 3 plus its stride padding worries.
  row0: d.vec4f, // [w00, w01, w02, offset]
  row1: d.vec4f, // [w10, w11, w12, _unused]
  row2: d.vec4f  // [w20, w21, w22, divisor]
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: Convolve3x3Params },
  source: { texture: "float" },
  mask: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "nearest",
  minFilter: "nearest",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const filtersConvolve3x3V1 = defineModule({
  id: "filters.convolve3x3",
  version: 1,
  surface: "internal",
  category: "filters",
  linearity: "nonlinear-in-rgb",
  kind: "fragment",
  params: Convolve3x3Params,
  paramDefaults: {
    // Identity kernel by default.
    row0: d.vec4f(0, 0, 0, 0),
    row1: d.vec4f(0, 1, 0, 0),
    row2: d.vec4f(0, 0, 0, 1)
  },
  paramUi: {},
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let dims = textureDimensions(layout.$.source);
  let px = 1.0 / vec2f(f32(dims.x), f32(dims.y));
  let p = layout.$.params;

  // Un-premultiply every tap so the kernel runs on straight colour. Convolving
  // premultiplied rgb skews the weights against per-pixel alpha and can drive
  // the result above the (preserved) centre alpha, breaking rgb <= a. The
  // result is re-premultiplied by the centre alpha before output.
  let c00 = textureSample(layout.$.source, layout.$.samp, uv + vec2f(-px.x, -px.y));
  let c01 = textureSample(layout.$.source, layout.$.samp, uv + vec2f(   0.0, -px.y));
  let c02 = textureSample(layout.$.source, layout.$.samp, uv + vec2f( px.x, -px.y));
  let c10 = textureSample(layout.$.source, layout.$.samp, uv + vec2f(-px.x,    0.0));
  let centerS = textureSample(layout.$.source, layout.$.samp, uv);
  let c12 = textureSample(layout.$.source, layout.$.samp, uv + vec2f( px.x,    0.0));
  let c20 = textureSample(layout.$.source, layout.$.samp, uv + vec2f(-px.x,  px.y));
  let c21 = textureSample(layout.$.source, layout.$.samp, uv + vec2f(   0.0,  px.y));
  let c22 = textureSample(layout.$.source, layout.$.samp, uv + vec2f( px.x,  px.y));

  let s00 = c00.rgb / max(c00.a, 1.0 / 255.0);
  let s01 = c01.rgb / max(c01.a, 1.0 / 255.0);
  let s02 = c02.rgb / max(c02.a, 1.0 / 255.0);
  let s10 = c10.rgb / max(c10.a, 1.0 / 255.0);
  let s11 = centerS.rgb / max(centerS.a, 1.0 / 255.0);
  let s12 = c12.rgb / max(c12.a, 1.0 / 255.0);
  let s20 = c20.rgb / max(c20.a, 1.0 / 255.0);
  let s21 = c21.rgb / max(c21.a, 1.0 / 255.0);
  let s22 = c22.rgb / max(c22.a, 1.0 / 255.0);

  var acc = s00 * p.row0.x + s01 * p.row0.y + s02 * p.row0.z
          + s10 * p.row1.x + s11 * p.row1.y + s12 * p.row1.z
          + s20 * p.row2.x + s21 * p.row2.y + s22 * p.row2.z;

  let declared = p.row2.w;
  let kSum = p.row0.x + p.row0.y + p.row0.z
           + p.row1.x + p.row1.y + p.row1.z
           + p.row2.x + p.row2.y + p.row2.z;
  let divisor = select(declared, select(1.0, kSum, kSum != 0.0), declared == 0.0);

  acc = acc / divisor + vec3f(p.row0.w);
  let outStraight = clamp(acc, vec3f(0.0), vec3f(1.0));

  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let mixedStraight = mix(s11, outStraight, coverage);
  return vec4f(mixedStraight * centerS.a, centerS.a);
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
