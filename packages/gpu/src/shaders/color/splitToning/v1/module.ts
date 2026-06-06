/**
 * `color.splitToning@1` — tint shadows and highlights toward two different
 * colours.
 *
 * Ported verbatim from the CPU `lib.image.color_grading.SplitToning` loop. The
 * host resolves the shadow/highlight hues to normalized RGB tint colours
 * (`hsv→rgb` at full saturation/value) and passes them as `vec3f`s; the shader
 * weights each toward shadows/highlights by a balance-shifted luminance mask.
 * Fragment, with the canonical optional mask slot.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const SplitToningParams = d.struct({
  shadowColor: d.vec3f,
  shadowSat: d.f32,
  highlightColor: d.vec3f,
  highlightSat: d.f32,
  balance: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: SplitToningParams },
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

export const colorSplitToningV1 = defineModule({
  id: "color.splitToning",
  version: 1,
  surface: "internal",
  category: "color",
  linearity: "nonlinear-in-rgb",
  kind: "fragment",
  params: SplitToningParams,
  paramDefaults: {
    shadowColor: d.vec3f(0.5, 0.5, 0.5),
    shadowSat: 0,
    highlightColor: d.vec3f(0.5, 0.5, 0.5),
    highlightSat: 0,
    balance: 0
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
fn luma709(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let p = layout.$.params;
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let lum = luma709(straight);
  let balOff = p.balance * 0.25;
  let shMask = clamp((0.5 + balOff - lum) * 2.0, 0.0, 1.0);
  let hlMask = clamp((lum - 0.5 + balOff) * 2.0, 0.0, 1.0);
  let rgb = straight
    + shMask * (p.shadowColor - vec3f(0.5)) * p.shadowSat
    + hlMask * (p.highlightColor - vec3f(0.5)) * p.highlightSat;
  let mixed = mix(straight, rgb, coverage);
  return vec4f(clamp(mixed, vec3f(0.0), vec3f(1.0)) * src.a, src.a);
}
`,
  io: {
    inputs: {
      source: {
        colorSpace: "srgb",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"]
      },
      mask: {
        colorSpace: "srgb",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"],
        optional: true
      }
    },
    output: {
      colorSpace: "srgb",
      alpha: "premultiplied",
      format: "rgba8unorm",
      dimensions: "same-as:source"
    },
    rod: "same-as:source"
  }
});
