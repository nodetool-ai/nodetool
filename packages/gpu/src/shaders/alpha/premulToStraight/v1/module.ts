import { UNPREMULTIPLY_RGB_WGSL, ZERO_ALPHA_WGSL } from "../../../../colorHelpers.js";
/**
 * `alpha.premulToStraight@1` — convert premultiplied-alpha RGB to straight.
 *
 * Per-pixel `vec4(rgb, a) → vec4(rgb / a, a)` (transparent pixels collapse to
 * `vec4(0)`). The inverse of
 * {@link ./../straightToPremul/v1/module alphaStraightToPremulV1}; the two
 * exist so hosts can bridge straight↔premultiplied boundaries explicitly
 * instead of letting metadata drift.
 *
 * Output color space matches input — this module touches association only.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

const ConvertParams = d.struct({ _unused: d.f32 });

const layout = tgpu.bindGroupLayout({
  source: { texture: "float" },
  outputTexture: { storageTexture: "rgba8unorm" }
});

export const alphaPremulToStraightV1 = defineModule({
  precision: { "source": "working", "output": "working" },
  id: "alpha.premulToStraight",
  version: 1,
  surface: "internal",
  category: "alpha",
  linearity: "nonlinear-in-rgb",
  kind: "compute",
  params: ConvertParams,
  paramDefaults: { _unused: 0 },
  layout,
  workgroupSize: [16, 16, 1],
  wgsl: /* wgsl */ `
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(layout.$.source);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coords = vec2<i32>(i32(gid.x), i32(gid.y));
  let c = textureLoad(layout.$.source, coords, 0);
  if (${ZERO_ALPHA_WGSL}) {
    textureStore(layout.$.outputTexture, coords, vec4<f32>(0.0));
    return;
  }
  textureStore(layout.$.outputTexture, coords, vec4<f32>(${UNPREMULTIPLY_RGB_WGSL}, c.a));
}
`,
  io: {
    inputs: {
      source: {
        colorSpace: "encoded-sdr",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"]
      }
    },
    output: {
      colorSpace: "encoded-sdr",
      alpha: "straight",
      format: "rgba8unorm",
      dimensions: "same-as:source"
    },
    rod: "same-as:source"
  }
});
