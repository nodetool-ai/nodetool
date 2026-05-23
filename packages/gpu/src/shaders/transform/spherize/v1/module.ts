/**
 * `transform.spherize@1` — spherical/fisheye lens distortion centered on the
 * source.
 *
 * `amount > 0` bulges the centre outward (fisheye, magnifying-glass);
 * `amount < 0` pinches it inward. The implementation is the classic
 * Photoshop-style normalized-radius warp: convert UV to centered polar,
 * remap the radius by `r' = r * (1 + amount * (1 - r²))`, convert back.
 *
 * Output dimensions stay `same-as:source`. Pixels outside the unit circle
 * pass through unchanged so the corners of a rectangular source aren't
 * snipped; pixels inside the circle get the spherical remap.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const SpherizeParams = d.struct({
  amount: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: SpherizeParams },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const transformSpherizeV1 = defineModule({
  id: "transform.spherize",
  version: 1,
  surface: "internal",
  category: "transform",
  kind: "fragment",
  params: SpherizeParams,
  paramDefaults: { amount: 0.5 },
  paramUi: {
    amount: {
      min: -1,
      max: 1,
      step: 0.01,
      label: "Amount",
      notes: "negative pinches, positive bulges"
    }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let amount = layout.$.params.amount;
  let centered = (uv - vec2f(0.5)) * 2.0;
  let r2 = dot(centered, centered);
  if (r2 >= 1.0) {
    return textureSample(layout.$.source, layout.$.samp, uv);
  }
  let factor = 1.0 + amount * (1.0 - r2);
  let warped = centered * factor;
  let s = warped * 0.5 + vec2f(0.5);
  // Positive amount magnifies (factor > 1) and can push s outside [0,1].
  // Return transparent black rather than smearing the edge — matches the
  // out-of-bounds convention in transform.affine / transform.cornerPin /
  // transform.crop.
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0) {
    return vec4f(0.0);
  }
  return textureSample(layout.$.source, layout.$.samp, s);
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
