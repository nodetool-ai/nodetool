/**
 * `color.hsb@1` — hue / saturation / brightness shift.
 *
 * Hue is in degrees (-180..180); saturation is multiplicative (0=grayscale,
 * 1=passthrough, >1=oversaturate); brightness is multiplicative on the value
 * channel. Math is the standard `rgb ↔ hsv` round-trip used by `color.grade`.
 * Fragment, with the canonical mask slot.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";
import { WGSL_HSV } from "../../../../shared/hsvWgsl.js";

export const HsbParams = d.struct({
  hue: d.f32,
  saturation: d.f32,
  brightness: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: HsbParams },
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

export const colorHsbV1 = defineModule({
  id: "color.hsb",
  version: 1,
  // HSB shift is the workflow user's mental model for color adjustment; the
  // schema matches that vocabulary exactly.
  surface: "published",
  category: "color",
  linearity: "nonlinear-in-rgb",
  kind: "fragment",
  params: HsbParams,
  paramDefaults: { hue: 0, saturation: 1, brightness: 1 },
  paramUi: {
    hue: { min: -180, max: 180, step: 1, label: "Hue", notes: "degrees" },
    saturation: { min: 0, max: 4, step: 0.01, label: "Saturation" },
    brightness: { min: 0, max: 4, step: 0.01, label: "Brightness" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
${WGSL_HSV}
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let p = layout.$.params;
  // Operate on the straight color: rgb2hsv's V channel is max(r,g,b), so a
  // premultiplied input reports a*V_true and the saturation/brightness
  // multipliers act against the wrong magnitude. Re-premultiply on store so
  // the output stays valid premul.
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  var hsv = rgb2hsv(clamp(straight, vec3f(0.0), vec3f(1.0)));
  hsv.x = fract(hsv.x + p.hue / 360.0);
  hsv.y = clamp(hsv.y * p.saturation, 0.0, 1.0);
  hsv.z = clamp(hsv.z * p.brightness, 0.0, 1.0);
  let processed = clamp(hsv2rgb(hsv), vec3f(0.0), vec3f(1.0));
  let mixedStraight = mix(straight, processed, coverage);
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
