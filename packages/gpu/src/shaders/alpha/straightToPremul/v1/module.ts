/**
 * `alpha.straightToPremul@1` — convert straight-alpha RGB to premultiplied.
 *
 * Per-pixel `vec4(rgb, a) → vec4(rgb * a, a)`. Pairs with
 * {@link ./../premulToStraight/v1/module premulToStraightV1} as the two
 * canonical alpha boundary modules. The Executor's strict input validation
 * (Phase 3) catches alpha-association mismatches between modules; hosts insert
 * one of these passes explicitly to bridge a straight ingress (e.g. video
 * `copyExternalImageToTexture` with `premultipliedAlpha: false`) into a chain
 * of premultiplied modules.
 *
 * Output color space matches input — this module touches association only, not
 * the encoding curve.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

const ConvertParams = d.struct({ _unused: d.f32 });

const layout = tgpu.bindGroupLayout({
  source: { texture: "float" },
  outputTexture: { storageTexture: "rgba8unorm" }
});

export const alphaStraightToPremulV1 = defineModule({
  id: "alpha.straightToPremul",
  version: 1,
  surface: "internal",
  category: "alpha",
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
  textureStore(layout.$.outputTexture, coords, vec4<f32>(c.rgb * c.a, c.a));
}
`,
  io: {
    inputs: {
      source: {
        colorSpace: "srgb",
        alpha: "straight",
        bindingKinds: ["texture_2d"]
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
