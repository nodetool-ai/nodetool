/**
 * `color.posterize@1` — quantize each channel to N levels.
 *
 * `levels` clamps to `[2, 256]`. At `levels = 2` the output is binary
 * per channel (eight discrete colors); at `levels = 256` it's the full
 * 8-bit range (effectively passthrough — covers PIL `bits=8` semantics).
 * Fragment, with the canonical mask slot.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const PosterizeParams = d.struct({
  levels: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: PosterizeParams },
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

const wgsl = /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let n = max(2.0, min(256.0, layout.$.params.levels));
  // Quantize the underlying straight color, not the premultiplied RGB; on
  // partial-alpha pixels the premultiplied form has rgb <= a, so quantizing
  // before un-premultiplying snaps to the wrong bin and can push rgb > a.
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let quantized = floor(clamp(straight, vec3f(0.0), vec3f(1.0)) * n) / (n - 1.0);
  let mixedStraight = mix(straight, clamp(quantized, vec3f(0.0), vec3f(1.0)), coverage);
  return vec4f(mixedStraight * src.a, src.a);
}
`;

export const colorPosterizeV1 = defineModule({
  precision: { "source": "working", "mask": "fixed", "output": "working" },
  id: "color.posterize",
  version: 1,
  surface: "internal",
  category: "color",
  linearity: "nonlinear-in-rgb",
  kind: "fragment",
  params: PosterizeParams,
  paramDefaults: { levels: 4 },
  paramUi: {
    levels: { min: 2, max: 256, step: 1, label: "Levels" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl,
  // Posterize intentionally bins byte codes. Recover that lattice after
  // FP16 storage, which can move e.g. 170/255 below the three-level edge.
  // Only bin selection is snapped. Coverage and alpha retain float precision.
  workingWgsl: wgsl.replace(
    "let quantized = floor(clamp(straight, vec3f(0.0), vec3f(1.0)) * n) / (n - 1.0);",
    `let alphaCode = max(1.0, round(src.a * 255.0));
  let codes = round(clamp(src.rgb, vec3f(0.0), vec3f(safeA)) * 255.0);
  let scaled = codes * n;
  var bins = floor(scaled / alphaCode);
  bins += select(vec3f(0.0), vec3f(1.0), scaled >= (bins + vec3f(1.0)) * alphaCode);
  bins -= select(vec3f(0.0), vec3f(1.0), scaled < bins * alphaCode);
  let quantized = bins / (n - 1.0);`
  ),
  io: {
    inputs: {
      source: {
        colorSpace: "encoded-sdr",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"]
      },
      mask: {
        colorSpace: "data",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"],
        optional: true
      }
    },
    output: {
      colorSpace: "encoded-sdr",
      alpha: "premultiplied",
      format: "rgba8unorm",
      dimensions: "same-as:source"
    },
    rod: "same-as:source"
  }
});
