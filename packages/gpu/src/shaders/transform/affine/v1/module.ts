/**
 * `transform.affine@1` — apply an inverse 2D affine matrix to remap UV space.
 *
 * The params spell out a 2×3 inverse matrix: each output UV `(u, v)` maps to
 * the source UV `(m00*u + m01*v + tx, m10*u + m11*v + ty)`. Authoring the
 * **inverse** keeps the WGSL a single matrix-vector multiply — exactly the
 * same pattern `compositor/transform.ts` uses for layer placement.
 *
 * Output dimensions are `host-specified`. Out-of-bounds samples
 * (`u < 0 || u > 1 || v < 0 || v > 1`) return transparent black so a rotated
 * or scaled source leaves cleanly transparent corners rather than smearing
 * the edge color.
 *
 * For arbitrary rotation around the source center with scale, the host
 * composes the inverse matrix on the CPU (`compositor/transform.ts`
 * `layerTransformToInverseAffine` is the canonical helper); this module
 * just consumes it.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const AffineParams = d.struct({
  m00: d.f32,
  m01: d.f32,
  tx: d.f32,
  m10: d.f32,
  m11: d.f32,
  ty: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: AffineParams },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const transformAffineV1 = defineModule({
  id: "transform.affine",
  version: 1,
  surface: "internal",
  category: "transform",
  linearity: "linear-in-rgb",
  kind: "fragment",
  params: AffineParams,
  // Identity inverse affine = passthrough.
  paramDefaults: { m00: 1, m01: 0, tx: 0, m10: 0, m11: 1, ty: 0 },
  paramUi: {
    m00: { label: "m00", notes: "inverse matrix row 0" },
    m01: { label: "m01", notes: "inverse matrix row 0" },
    tx: { label: "tx", notes: "inverse translation X" },
    m10: { label: "m10", notes: "inverse matrix row 1" },
    m11: { label: "m11", notes: "inverse matrix row 1" },
    ty: { label: "ty", notes: "inverse translation Y" }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = layout.$.params;
  let s = vec2f(
    p.m00 * uv.x + p.m01 * uv.y + p.tx,
    p.m10 * uv.x + p.m11 * uv.y + p.ty
  );
  // Sample unconditionally (WGSL requires textureSample in uniform control
  // flow) and select transparent black for out-of-bounds taps. The clamp-to-
  // edge sampler makes the discarded out-of-bounds read harmless.
  let oob = s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0;
  let col = textureSample(layout.$.source, layout.$.samp, s);
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
      dimensions: "host-specified"
    },
    rod: "explicit"
  }
});
