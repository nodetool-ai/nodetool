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
  linearity: "linear-in-rgb",
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
  // Inverse map: an output pixel at radius r samples the source at r*factor.
  // To bulge (magnify) the centre, the source radius must be pulled inward
  // (factor < 1 near the centre), so positive amount subtracts. Using
  // 1.0 + amount * (...) inverted this and pinched on positive amount, the
  // opposite of the documented behaviour.
  let factor = 1.0 - amount * (1.0 - r2);
  let warpedUv = centered * factor * 0.5 + vec2f(0.5);
  // Outside the unit circle: passthrough (sample the original uv). Inside:
  // sample the warped uv. textureSample must run in uniform control flow, so
  // pick the source uv up front and sample once.
  let inside = r2 < 1.0;
  let s = select(uv, warpedUv, inside);
  let col = textureSample(layout.$.source, layout.$.samp, s);
  // A strong pinch (amount < 0) can push the warped uv outside [0,1]; those
  // taps become transparent black rather than smearing the edge, matching the
  // out-of-bounds convention in transform.affine / transform.cornerPin.
  let oob = inside && (warpedUv.x < 0.0 || warpedUv.x > 1.0 || warpedUv.y < 0.0 || warpedUv.y > 1.0);
  return select(col, vec4f(0.0), oob);
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
