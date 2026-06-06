/**
 * `color.liftGammaGain@1` — three-way (shadows / midtones / highlights) color
 * corrector.
 *
 * Ported verbatim from the CPU `lib.image.color_grading.LiftGammaGain` loop:
 * `out = ((in + lift) * gain) ^ (1 / gamma)` per channel, with master
 * multipliers folded into each per-channel knob. Lift shifts shadows, gain
 * scales highlights, gamma bends midtones. Fragment, with the canonical
 * optional mask slot.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const LiftGammaGainParams = d.struct({
  liftR: d.f32,
  liftG: d.f32,
  liftB: d.f32,
  liftMaster: d.f32,
  gammaR: d.f32,
  gammaG: d.f32,
  gammaB: d.f32,
  gammaMaster: d.f32,
  gainR: d.f32,
  gainG: d.f32,
  gainB: d.f32,
  gainMaster: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: LiftGammaGainParams },
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

export const colorLiftGammaGainV1 = defineModule({
  id: "color.liftGammaGain",
  version: 1,
  surface: "internal",
  category: "color",
  linearity: "nonlinear-in-rgb",
  kind: "fragment",
  params: LiftGammaGainParams,
  paramDefaults: {
    liftR: 0,
    liftG: 0,
    liftB: 0,
    liftMaster: 0,
    gammaR: 1,
    gammaG: 1,
    gammaB: 1,
    gammaMaster: 1,
    gainR: 1,
    gainG: 1,
    gainB: 1,
    gainMaster: 1
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let p = layout.$.params;
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  let lift = vec3f(p.liftR + p.liftMaster, p.liftG + p.liftMaster, p.liftB + p.liftMaster);
  let gain = vec3f(p.gainR * p.gainMaster, p.gainG * p.gainMaster, p.gainB * p.gainMaster);
  let r = (straight + lift) * gain;
  let gammaInv = vec3f(
    1.0 / max(0.01, p.gammaR * p.gammaMaster),
    1.0 / max(0.01, p.gammaG * p.gammaMaster),
    1.0 / max(0.01, p.gammaB * p.gammaMaster)
  );
  // pow(negative, x) is undefined; the CPU path returns 0 for r <= 0, so
  // guard with max() and select the 0 branch to match exactly.
  var rgb = vec3f(
    select(0.0, pow(max(r.r, 0.0), gammaInv.r), r.r > 0.0),
    select(0.0, pow(max(r.g, 0.0), gammaInv.g), r.g > 0.0),
    select(0.0, pow(max(r.b, 0.0), gammaInv.b), r.b > 0.0)
  );
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
