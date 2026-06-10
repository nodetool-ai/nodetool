/**
 * `color.exposure@1` — multiplicative exposure in stops (`rgb *= pow(2, stops)`).
 *
 * `0` stops is passthrough; `+1` doubles, `-1` halves. Clamps output to
 * `[0, 1]` since the working format is SDR; HDR exposure ships with the
 * separate HDR pipeline plan. Fragment, with the canonical mask slot.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const ExposureParams = d.struct({
  stops: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: ExposureParams },
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

export const colorExposureV1 = defineModule({
  id: "color.exposure",
  version: 1,
  surface: "internal",
  category: "color",
  linearity: "linear-in-rgb",
  kind: "fragment",
  params: ExposureParams,
  paramDefaults: { stops: 0 },
  paramUi: {
    stops: { min: -4, max: 4, step: 0.1, label: "Exposure", notes: "stops (2^x)" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let gain = pow(2.0, layout.$.params.stops);
  // SDR clamp on the *straight* colour means clamping at alpha in premul
  // space: straight C clamps at 1.0 ⇒ premul a*C clamps at a. Clamping at a
  // literal 1.0 here let partial-alpha pixels escape with rgb > a (a 2×
  // over-bright fringe once composited).
  let processed = clamp(src.rgb * gain, vec3f(0.0), vec3f(src.a));
  let mixed = mix(src.rgb, processed, coverage);
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
