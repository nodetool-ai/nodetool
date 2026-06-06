/**
 * `transform.cornerPin@1` — perspective warp via an inverse 3×3 homography.
 *
 * Each output UV `(x, y)` is mapped to source UV by
 * `(u, v, w) = H · (x, y, 1)` and then `(u/w, v/w)`. The eight free
 * coefficients of `H` (with `h22 = 1`) are exposed as params; the host
 * computes them from a four-corner correspondence using the standard
 * homography formula and passes the matrix down. Authoring the **inverse**
 * keeps the WGSL a single multiply + divide rather than a per-pixel
 * inverse-bilinear solve.
 *
 * Out-of-bounds samples return transparent black so the warped source leaves
 * the surrounding area transparent rather than smearing the edge color.
 * Output dimensions are `same-as:source` — pinning happens inside the
 * source's canvas. For perspective warps onto a different canvas size, run
 * `transform.resize` upstream or `transform.affine` for non-perspective
 * cases.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const CornerPinParams = d.struct({
  h00: d.f32,
  h01: d.f32,
  h02: d.f32,
  h10: d.f32,
  h11: d.f32,
  h12: d.f32,
  h20: d.f32,
  h21: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: CornerPinParams },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const transformCornerPinV1 = defineModule({
  id: "transform.cornerPin",
  version: 1,
  surface: "internal",
  category: "transform",
  linearity: "linear-in-rgb",
  kind: "fragment",
  params: CornerPinParams,
  // Identity homography: H = I (h22 = 1 implicit).
  paramDefaults: {
    h00: 1,
    h01: 0,
    h02: 0,
    h10: 0,
    h11: 1,
    h12: 0,
    h20: 0,
    h21: 0
  },
  paramUi: {
    h00: { label: "H00" },
    h01: { label: "H01" },
    h02: { label: "H02" },
    h10: { label: "H10" },
    h11: { label: "H11" },
    h12: { label: "H12" },
    h20: { label: "H20" },
    h21: { label: "H21" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let w = p.h20 * uv.x + p.h21 * uv.y + 1.0;
  let degenerate = abs(w) < 1e-6;
  // Guard the perspective divide so u/v stay finite even at the singularity;
  // those pixels are discarded by the select below anyway.
  let wSafe = select(w, 1.0, degenerate);
  let u = (p.h00 * uv.x + p.h01 * uv.y + p.h02) / wSafe;
  let v = (p.h10 * uv.x + p.h11 * uv.y + p.h12) / wSafe;
  // Sample unconditionally (textureSample must run in uniform control flow);
  // select transparent black at the singularity or outside the source.
  let oob = degenerate || u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0;
  let col = textureSample(layout.$.source, layout.$.samp, vec2f(u, v));
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
    rod: "explicit"
  }
});
