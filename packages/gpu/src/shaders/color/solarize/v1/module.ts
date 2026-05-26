/**
 * `color.solarize@1` — invert RGB channels whose value exceeds `threshold`.
 *
 * Classic PIL `ImageOps.solarize`. Each channel independently: if its value
 * is greater than `threshold` (0..1), output `1 - v`; otherwise pass through.
 * Alpha preserved.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const SolarizeParams = d.struct({
  threshold: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: SolarizeParams },
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

export const colorSolarizeV1 = defineModule({
  id: "color.solarize",
  version: 1,
  surface: "internal",
  category: "color",
  linearity: "nonlinear-in-rgb",
  kind: "fragment",
  params: SolarizeParams,
  paramDefaults: { threshold: 0.5 },
  paramUi: {
    threshold: { min: 0, max: 1, step: 0.01, label: "Threshold" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let t = layout.$.params.threshold;
  // Threshold the underlying straight color so the comparison against t is
  // alpha-independent; otherwise transparent pixels (premultiplied near 0)
  // are below threshold even when their underlying color is bright.
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let inverted = vec3f(
    select(straight.r, 1.0 - straight.r, straight.r > t),
    select(straight.g, 1.0 - straight.g, straight.g > t),
    select(straight.b, 1.0 - straight.b, straight.b > t)
  );
  let mixedStraight = mix(straight, inverted, coverage);
  return vec4f(mixedStraight * src.a, src.a);
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
