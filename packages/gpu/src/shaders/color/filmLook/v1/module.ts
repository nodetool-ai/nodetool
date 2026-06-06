/**
 * `color.filmLook@1` — cinematic film-emulation grade with adjustable
 * intensity.
 *
 * Ported verbatim from the CPU `lib.image.color_grading.FilmLook` loop. The
 * host resolves a named preset (teal/orange, noir, …) to its shadow/highlight
 * tint colours plus contrast, saturation, and fade scalars, and passes them
 * as params. The shader applies the look on straight RGB then lerps from the
 * original by `intensity`. Fragment, with the canonical optional mask slot.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const FilmLookParams = d.struct({
  shadow: d.vec3f,
  contrast: d.f32,
  highlight: d.vec3f,
  saturation: d.f32,
  fade: d.f32,
  intensity: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: FilmLookParams },
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

export const colorFilmLookV1 = defineModule({
  id: "color.filmLook",
  version: 1,
  surface: "internal",
  category: "color",
  linearity: "nonlinear-in-rgb",
  kind: "fragment",
  params: FilmLookParams,
  paramDefaults: {
    shadow: d.vec3f(0.5, 0.5, 0.5),
    contrast: 1,
    highlight: d.vec3f(0.5, 0.5, 0.5),
    saturation: 1,
    fade: 0,
    intensity: 0
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
  var rgb = straight;
  let lum = luma709(rgb);
  let shMask = clamp(1.0 - lum * 2.0, 0.0, 1.0);
  let hlMask = clamp(lum * 2.0 - 1.0, 0.0, 1.0);
  rgb = rgb
    + shMask * (p.shadow - vec3f(0.5)) * 0.3
    + hlMask * (p.highlight - vec3f(0.5)) * 0.3;
  rgb = (rgb - vec3f(0.5)) * p.contrast + vec3f(0.5);
  let lum2 = luma709(rgb);
  rgb = vec3f(lum2) + (rgb - vec3f(lum2)) * p.saturation;
  // fade = 0 leaves rgb unchanged, so the CPU's "if (fade > 0)" guard is moot.
  rgb = rgb * (1.0 - p.fade) + vec3f(p.fade * 0.15);
  rgb = straight + (rgb - straight) * p.intensity;
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
