/**
 * `color.levels@1` — per-channel input black point, gamma, and white point.
 *
 * For each of R/G/B independently: remap `[black, white]` onto `[0, 1]` then
 * apply gamma — `out = pow(clamp((in - black) / (white - black), 0, 1), 1/gamma)`.
 * `black`/`white` are normalized to `[0, 1]` (the host divides 0–255 inputs by
 * 255); `gamma` is the channel gamma. The identity is `black=0, gamma=1,
 * white=1`. Alpha is untouched. Fragment, with the canonical mask slot.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const LevelsParams = d.struct({
  rBlack: d.f32,
  rGamma: d.f32,
  rWhite: d.f32,
  gBlack: d.f32,
  gGamma: d.f32,
  gWhite: d.f32,
  bBlack: d.f32,
  bGamma: d.f32,
  bWhite: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: LevelsParams },
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

export const colorLevelsV1 = defineModule({
  id: "color.levels",
  version: 1,
  surface: "internal",
  category: "color",
  linearity: "nonlinear-in-rgb",
  kind: "fragment",
  params: LevelsParams,
  paramDefaults: {
    rBlack: 0,
    rGamma: 1,
    rWhite: 1,
    gBlack: 0,
    gGamma: 1,
    gWhite: 1,
    bBlack: 0,
    bGamma: 1,
    bWhite: 1
  },
  paramUi: {
    rBlack: { min: 0, max: 1, step: 0.01, label: "Red black" },
    rGamma: { min: 0.01, max: 10, step: 0.01, label: "Red gamma" },
    rWhite: { min: 0, max: 1, step: 0.01, label: "Red white" },
    gBlack: { min: 0, max: 1, step: 0.01, label: "Green black" },
    gGamma: { min: 0.01, max: 10, step: 0.01, label: "Green gamma" },
    gWhite: { min: 0, max: 1, step: 0.01, label: "Green white" },
    bBlack: { min: 0, max: 1, step: 0.01, label: "Blue black" },
    bGamma: { min: 0.01, max: 10, step: 0.01, label: "Blue gamma" },
    bWhite: { min: 0, max: 1, step: 0.01, label: "Blue white" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
fn levelChannel(x: f32, black: f32, gamma: f32, white: f32) -> f32 {
  let denom = max(1.0 / 255.0, white - black);
  let t = clamp((x - black) / denom, 0.0, 1.0);
  return pow(t, 1.0 / max(0.01, gamma));
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  // Operate on straight (un-premultiplied) color so the per-channel remap is
  // correct on partial-alpha pixels, then re-premultiply on output.
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let p = layout.$.params;
  let leveled = vec3f(
    levelChannel(straight.r, p.rBlack, p.rGamma, p.rWhite),
    levelChannel(straight.g, p.gBlack, p.gGamma, p.gWhite),
    levelChannel(straight.b, p.bBlack, p.bGamma, p.bWhite)
  );
  let mixedStraight = mix(straight, clamp(leveled, vec3f(0.0), vec3f(1.0)), coverage);
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
