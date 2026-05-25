/**
 * `mask.fromImage@1` — derive a mask from an image's channels.
 *
 * `mode` selects the source channel(s): `0` alpha, `1` luminance,
 * `2` red, `3` green, `4` blue, `5` max-channel. Output writes the derived
 * coverage into the alpha channel and zeroes RGB — downstream `mask.apply`
 * (or any module reading `mask.a`) consumes it directly.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const MaskFromImageParams = d.struct({
  mode: d.f32,
  invert: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: MaskFromImageParams },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const maskFromImageV1 = defineModule({
  id: "mask.fromImage",
  version: 1,
  surface: "internal",
  category: "mask",
  kind: "fragment",
  params: MaskFromImageParams,
  paramDefaults: { mode: 1, invert: 0 },
  paramUi: {
    mode: {
      min: 0,
      max: 5,
      step: 1,
      label: "Mode",
      notes: "0 alpha / 1 luma / 2 R / 3 G / 4 B / 5 max"
    },
    invert: { min: 0, max: 1, step: 1, label: "Invert" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let p = layout.$.params;
  let mode = i32(round(p.mode));
  // Source is premultiplied (rgb = a*C); divide back out so the derived mask
  // reflects the underlying color, not the alpha-dimmed display value. Modes
  // that already pick the alpha channel (mode 0) read src.a directly.
  let safeA = max(src.a, 1.0 / 255.0);
  let straight = src.rgb / safeA;
  var value: f32 = 0.0;
  if (mode == 0) {
    value = src.a;
  } else if (mode == 1) {
    // Rec. 709 luma coefficients for the declared linear color space.
    value = dot(straight, vec3f(0.2126, 0.7152, 0.0722));
  } else if (mode == 2) {
    value = straight.r;
  } else if (mode == 3) {
    value = straight.g;
  } else if (mode == 4) {
    value = straight.b;
  } else {
    value = max(max(straight.r, straight.g), straight.b);
  }
  if (p.invert > 0.5) {
    value = 1.0 - value;
  }
  return vec4f(0.0, 0.0, 0.0, clamp(value, 0.0, 1.0));
}
`,
  io: {
    inputs: {
      source: {
        colorSpace: "linear",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"]
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
