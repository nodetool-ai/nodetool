/**
 * `color.brightnessContrast@1` — additive brightness, multiplicative contrast.
 *
 * Math matches the timeline preview's color-correction stage (also used by
 * `color.grade@1`): `rgb = (rgb - 0.5) * contrast + 0.5 + brightness`, clamped
 * to `[0, 1]`. Fragment, with the canonical mask slot.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const BrightnessContrastParams = d.struct({
  brightness: d.f32,
  contrast: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: BrightnessContrastParams },
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

export const colorBrightnessContrastV1 = defineModule({
  id: "color.brightnessContrast",
  version: 1,
  // Promoted in Phase 3 Batch 1: same math as `color.grade`'s sub-stage, now
  // its own published op for workflow nodes that only need brightness/contrast.
  surface: "published",
  category: "color",
  kind: "fragment",
  params: BrightnessContrastParams,
  paramDefaults: { brightness: 0, contrast: 1 },
  paramUi: {
    brightness: { min: -1, max: 1, step: 0.01, label: "Brightness" },
    contrast: { min: 0, max: 4, step: 0.01, label: "Contrast" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let coverage = textureSample(layout.$.mask, layout.$.samp, uv).a;
  let p = layout.$.params;
  let adjusted = clamp((src.rgb - vec3f(0.5)) * p.contrast + vec3f(0.5) + vec3f(p.brightness), vec3f(0.0), vec3f(1.0));
  let mixed = mix(src.rgb, adjusted, coverage);
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
